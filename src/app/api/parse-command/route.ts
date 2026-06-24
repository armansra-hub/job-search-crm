import { NextResponse } from "next/server";
import { requireUser, badRequest, serverError } from "@/lib/api";
import { anthropic, MODEL_REASONING, toolInputOf } from "@/lib/anthropic";
import { OPERATION_KINDS, type CommandPlan } from "@/lib/command";

// POST /api/parse-command
// Body: { transcript: string }
// Returns a CommandPlan (proposed diff). DOES NOT WRITE ANYTHING.
//
// Hard behaviors enforced here:
//  - Confirm before apply: this route only proposes; apply-command writes.
//  - Match, don't guess: the snapshot is built server-side from the DB, and
//    the model is told to add a warning rather than invent an application id.
//  - NO message drafting: outreach intent is captured into outreach_notes only.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: { transcript?: string; now?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }
  const transcript = String(body.transcript || "").trim();
  if (!transcript) return badRequest("transcript is required.");

  // Build the state snapshot server-side (more trustworthy than client input).
  const [{ data: apps }, { data: defs }] = await Promise.all([
    auth.supabase
      .from("applications")
      .select("id, company_name, role_title, stage, email_domain")
      .order("updated_at", { ascending: false }),
    auth.supabase.from("field_defs").select("key, label, type"),
  ]);

  const snapshot = {
    applications: apps ?? [],
    field_defs: defs ?? [],
  };
  const nowIso = body.now || new Date().toISOString();

  const system = [
    "You convert a single voice/text command from a job seeker into a STRUCTURED DIFF of proposed changes to their job-search CRM.",
    "You NEVER write data — you only propose operations that the human will review and confirm.",
    "",
    "Hard rules:",
    "1. Resolve references like 'move Anduril to interviewing' to an EXISTING application by matching company_name (case-insensitive, fuzzy) in the snapshot, and use its id in application_id.",
    "2. If a referenced company is NOT clearly in the snapshot, either propose a create_application (if the user is clearly logging a new application) OR add a warning. NEVER invent or guess an application id.",
    "3. When the user logs a NEW application and dictates outreach intent (who to contact, their angle, why they fit), capture that thinking VERBATIM-ISH into the application's outreach_notes field. Organize lightly (bullet-like), but do NOT rewrite it into a polished message and do NOT draft any outreach message. You are preserving their ideas, not writing for them.",
    "4. For a new application, also: create_contact for each named person mentioned (name + role if given — do NOT ask for or require a LinkedIn URL), and create_task with type 'linkedin_outreach' due 48 hours from now to nudge the outreach. If no contacts are named, skip the create_contact step entirely — do NOT warn about it.",
    "5. 'delete X company' / 'remove X application' => delete_application with the resolved application_id. This is a hard delete (cascades to tasks/contacts/email_events). The user must confirm.",
    "5b. 'add a salary field' / 'track X for each company' => create_field_def (choose a snake_case key, a human field_label, and a type of text|number|date|select).",
    "6. Use ISO 8601 for all dates/times. Compute relative times ('in 2 days', 'tomorrow 9am') relative to the provided current time.",
    "7. Every operation needs a short human-readable 'label' describing the change for the confirmation UI.",
    "8. Child operations (task/contact/outreach/custom field) target an application via application_id (existing) OR application_ref (the temp_id of a create_application in THIS same batch).",
    "",
    `Current time: ${nowIso}`,
    `48 hours from now: ${new Date(new Date(nowIso).getTime() + 48 * 3600_000).toISOString()}`,
    "",
    "Current state snapshot (JSON):",
    JSON.stringify(snapshot),
  ].join("\n");

  const tool = {
    name: "propose_changes",
    description:
      "Return the proposed structured diff. Call exactly once. Do not write data.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: { type: "string", description: "One sentence describing the overall change." },
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: OPERATION_KINDS as unknown as string[] },
              label: { type: "string" },
              temp_id: { type: "string", description: "For create_application: a local id child ops can reference." },
              application_id: { type: "string" },
              application_ref: { type: "string" },
              fields: {
                type: "object",
                description:
                  "For create_application/update_application: company_name, role_title, stage, source, email_domain, salary_target, jd_url, date_applied, outreach_notes, notes, follow_up_due.",
                additionalProperties: true,
              },
              title: { type: "string" },
              type: { type: "string", enum: ["linkedin_outreach", "follow_up", "custom"] },
              due_at: { type: "string" },
              name: { type: "string" },
              role: { type: "string" },
              linkedin_url: { type: "string" },
              email: { type: "string" },
              notes: { type: "string" },
              text: { type: "string", description: "For append_outreach_notes." },
              key: { type: "string" },
              field_label: { type: "string", description: "Human label for a new field_def." },
              value: { description: "For set_custom_field; any JSON value." },
              options: { type: "array", items: { type: "string" } },
            },
            required: ["kind", "label"],
            additionalProperties: true,
          },
        },
        warnings: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "operations", "warnings"],
    },
  };

  try {
    const message = await anthropic().messages.create({
      model: MODEL_REASONING,
      max_tokens: 2000,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: "propose_changes" },
      messages: [{ role: "user", content: transcript }],
    });

    const plan = toolInputOf<CommandPlan>(message, "propose_changes");
    if (!plan) return serverError("Model did not return a plan.");

    // Light normalization.
    plan.operations = Array.isArray(plan.operations) ? plan.operations : [];
    plan.warnings = Array.isArray(plan.warnings) ? plan.warnings : [];
    return NextResponse.json({ plan });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "Anthropic call failed.");
  }
}
