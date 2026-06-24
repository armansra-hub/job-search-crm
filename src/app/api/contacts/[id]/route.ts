import { NextResponse } from "next/server";
import { requireUser, badRequest, serverError } from "@/lib/api";

const WRITABLE = ["name", "role", "linkedin_url", "email", "notes"] as const;

// PATCH /api/contacts/:id
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
    .from("contacts")
    .update(updates)
    .eq("id", params.id)
    .select("*")
    .maybeSingle();

  if (error) return serverError(error.message);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ contact: data });
}

// DELETE /api/contacts/:id
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { error } = await auth.supabase
    .from("contacts")
    .delete()
    .eq("id", params.id);
  if (error) return serverError(error.message);
  return NextResponse.json({ ok: true });
}
