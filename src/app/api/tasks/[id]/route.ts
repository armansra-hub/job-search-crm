import { NextResponse } from "next/server";
import { requireUser, badRequest, serverError } from "@/lib/api";

// PATCH /api/tasks/:id — complete / snooze / reopen / edit.
// Body: { action?: 'complete'|'snooze'|'reopen', due_at?, title?, notes? }
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const updates: Record<string, unknown> = {};

  switch (body.action) {
    case "complete":
      updates.status = "done";
      updates.completed_at = new Date().toISOString();
      break;
    case "reopen":
      updates.status = "open";
      updates.completed_at = null;
      break;
    case "snooze": {
      // Push due_at out. Caller may pass an explicit due_at; otherwise +3 days.
      const due =
        (body.due_at as string) ||
        new Date(Date.now() + 3 * 86_400_000).toISOString();
      updates.status = "snoozed";
      updates.due_at = due;
      break;
    }
    default:
      // generic field edit
      break;
  }

  if ("title" in body) updates.title = body.title;
  if ("notes" in body) updates.notes = body.notes;
  if ("due_at" in body && body.action !== "snooze") updates.due_at = body.due_at;

  if (Object.keys(updates).length === 0) {
    return badRequest("Nothing to update.");
  }

  const { data, error } = await auth.supabase
    .from("tasks")
    .update(updates)
    .eq("id", params.id)
    .select("*")
    .maybeSingle();

  if (error) return serverError(error.message);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task: data });
}

// DELETE /api/tasks/:id
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { error } = await auth.supabase.from("tasks").delete().eq("id", params.id);
  if (error) return serverError(error.message);
  return NextResponse.json({ ok: true });
}
