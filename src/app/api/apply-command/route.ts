import { NextResponse } from "next/server";
import { requireUser, badRequest, serverError } from "@/lib/api";
import type { Operation } from "@/lib/command";
import type { SupabaseClient } from "@supabase/supabase-js";

// POST /api/apply-command
// Body: { operations: Operation[] }
// Writes the user-CONFIRMED operations. RLS scopes every write to the user.
// This is the only place a voice/text command mutates data.

const APP_FIELDS = [
  "company_name",
  "role_title",
  "jd_url",
  "jd_summary",
  "source",
  "date_applied",
  "stage",
  "email_domain",
  "salary_target",
  "notes",
  "outreach_notes",
  "follow_up_due",
];

function pickAppFields(fields: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = {};
  if (!fields) return out;
  for (const k of APP_FIELDS) if (k in fields) out[k] = fields[k];
  // Normalize stage to lowercase so model casing ("Applied") doesn't break the enum.
  if (typeof out.stage === "string") out.stage = out.stage.toLowerCase();
  return out;
}

interface OpResult {
  label: string;
  kind: string;
  ok: boolean;
  error?: string;
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const supabase = auth.supabase as SupabaseClient;
  const userId = auth.user.id;

  let body: { operations?: Operation[] };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }
  const operations = Array.isArray(body.operations) ? body.operations : null;
  if (!operations) return badRequest("operations array is required.");

  const results: OpResult[] = [];
  const tempIdMap = new Map<string, string>(); // create_application temp_id -> new id

  // Resolve a child op's target application id.
  function resolveAppId(op: any): string | null {
    if (op.application_id) return String(op.application_id);
    if (op.application_ref && tempIdMap.has(op.application_ref)) {
      return tempIdMap.get(op.application_ref)!;
    }
    return null;
  }

  // ---- Pass 1: create applications + field defs (no dependencies) ----
  for (const op of operations) {
    if (op.kind === "create_application") {
      try {
        const fields = pickAppFields((op as any).fields);
        if (!fields.company_name) throw new Error("create_application needs company_name.");
        const { data, error } = await supabase
          .from("applications")
          .insert({ ...fields, user_id: userId })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        if (op.temp_id) tempIdMap.set(op.temp_id, data.id);
        results.push({ label: op.label, kind: op.kind, ok: true });
      } catch (e) {
        results.push({ label: op.label, kind: op.kind, ok: false, error: msg(e) });
      }
    } else if (op.kind === "create_field_def") {
      try {
        const { error } = await supabase.from("field_defs").insert({
          user_id: userId,
          key: op.key,
          label: op.field_label,
          type: op.type,
          options: op.options ?? [],
          applies_to: "applications",
        });
        if (error) throw new Error(error.message);
        results.push({ label: op.label, kind: op.kind, ok: true });
      } catch (e) {
        results.push({ label: op.label, kind: op.kind, ok: false, error: msg(e) });
      }
    }
  }

  // ---- Pass 2: everything that may depend on a freshly-created application ----
  for (const op of operations) {
    try {
      switch (op.kind) {
        case "create_application":
        case "create_field_def":
          break; // already handled

        case "update_application": {
          const fields = pickAppFields((op as any).fields);
          if (Object.keys(fields).length === 0) throw new Error("No fields to update.");
          const { data, error } = await supabase
            .from("applications")
            .update(fields)
            .eq("id", op.application_id)
            .select("id")
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!data) throw new Error("Application not found / not owned.");
          results.push({ label: op.label, kind: op.kind, ok: true });
          break;
        }

        case "create_task": {
          const appId = resolveAppId(op);
          if (!appId) throw new Error("Could not resolve target application.");
          const { error } = await supabase.from("tasks").insert({
            application_id: appId,
            title: op.title,
            type: op.type ?? "custom",
            due_at: op.due_at ?? null,
            notes: op.notes ?? null,
            status: "open",
          });
          if (error) throw new Error(error.message);
          results.push({ label: op.label, kind: op.kind, ok: true });
          break;
        }

        case "create_contact": {
          const appId = resolveAppId(op);
          if (!appId) throw new Error("Could not resolve target application.");
          const { error } = await supabase.from("contacts").insert({
            application_id: appId,
            name: op.name,
            role: op.role ?? null,
            linkedin_url: op.linkedin_url ?? null,
            email: op.email ?? null,
            notes: op.notes ?? null,
          });
          if (error) throw new Error(error.message);
          results.push({ label: op.label, kind: op.kind, ok: true });
          break;
        }

        case "append_outreach_notes": {
          const appId = resolveAppId(op);
          if (!appId) throw new Error("Could not resolve target application.");
          const { data: cur, error: readErr } = await supabase
            .from("applications")
            .select("outreach_notes")
            .eq("id", appId)
            .maybeSingle();
          if (readErr) throw new Error(readErr.message);
          if (!cur) throw new Error("Application not found / not owned.");
          const stamp = new Date().toLocaleDateString();
          const merged = [cur.outreach_notes, `[${stamp}] ${op.text}`]
            .filter(Boolean)
            .join("\n\n");
          const { error } = await supabase
            .from("applications")
            .update({ outreach_notes: merged })
            .eq("id", appId);
          if (error) throw new Error(error.message);
          results.push({ label: op.label, kind: op.kind, ok: true });
          break;
        }

        case "set_custom_field": {
          const appId = resolveAppId(op);
          if (!appId) throw new Error("Could not resolve target application.");
          const { data: cur, error: readErr } = await supabase
            .from("applications")
            .select("custom_fields")
            .eq("id", appId)
            .maybeSingle();
          if (readErr) throw new Error(readErr.message);
          if (!cur) throw new Error("Application not found / not owned.");
          const next = { ...(cur.custom_fields ?? {}), [op.key]: op.value };
          const { error } = await supabase
            .from("applications")
            .update({ custom_fields: next })
            .eq("id", appId);
          if (error) throw new Error(error.message);
          results.push({ label: op.label, kind: op.kind, ok: true });
          break;
        }

        case "delete_application": {
          const { error } = await supabase
            .from("applications")
            .delete()
            .eq("id", op.application_id);
          if (error) throw new Error(error.message);
          results.push({ label: op.label, kind: op.kind, ok: true });
          break;
        }

        default:
          results.push({
            label: (op as any).label ?? "unknown",
            kind: (op as any).kind ?? "unknown",
            ok: false,
            error: "Unknown operation kind.",
          });
      }
    } catch (e) {
      results.push({
        label: (op as any).label ?? "(op)",
        kind: (op as any).kind ?? "unknown",
        ok: false,
        error: msg(e),
      });
    }
  }

  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({
    ok: failed.length === 0,
    applied: results.filter((r) => r.ok).length,
    failed: failed.length,
    results,
  });
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
