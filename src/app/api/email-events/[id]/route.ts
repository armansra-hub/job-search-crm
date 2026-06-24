import { NextResponse } from "next/server";
import { requireUser, badRequest, serverError } from "@/lib/api";

// PATCH /api/email-events/:id
// Used to resolve a needs_review email: link it to an application and/or set a
// classification, or dismiss it (classification='other'). RLS (user_id) scopes
// this to the owner. This is the human-confirm step for hard behavior #2.
const WRITABLE = ["application_id", "classification"] as const;

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
  for (const k of WRITABLE) if (k in body) updates[k] = body[k];
  if (Object.keys(updates).length === 0) return badRequest("Nothing to update.");

  const { data, error } = await auth.supabase
    .from("email_events")
    .update(updates)
    .eq("id", params.id)
    .select("*")
    .maybeSingle();

  if (error) return serverError(error.message);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If we linked the event to an application, nudge that app's last_contact_at
  // so the board/digest reflect the (now-confirmed) inbound mail.
  if (updates.application_id && data.last_message_at) {
    await auth.supabase
      .from("applications")
      .update({ last_contact_at: data.last_message_at })
      .eq("id", updates.application_id as string);
  }

  return NextResponse.json({ email_event: data });
}
