import { NextResponse } from "next/server";
import { requireUser, badRequest, serverError, ownsApplication } from "@/lib/api";

const TASK_TYPES = ["linkedin_outreach", "follow_up", "custom"];

// POST /api/tasks — create a task on an application.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const application_id = String(body.application_id || "");
  const title = String(body.title || "").trim();
  if (!application_id) return badRequest("application_id is required.");
  if (!title) return badRequest("title is required.");
  if (!(await ownsApplication(auth.supabase, application_id))) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const type = TASK_TYPES.includes(String(body.type)) ? body.type : "custom";

  const { data, error } = await auth.supabase
    .from("tasks")
    .insert({
      application_id,
      title,
      type,
      due_at: body.due_at ?? null,
      notes: body.notes ?? null,
      status: "open",
    })
    .select("*")
    .single();

  if (error) return serverError(error.message);
  return NextResponse.json({ task: data }, { status: 201 });
}
