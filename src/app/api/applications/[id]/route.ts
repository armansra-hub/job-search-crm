import { NextResponse } from "next/server";
import { requireUser, badRequest, serverError } from "@/lib/api";
import { pickWritable } from "@/lib/applications";

// PATCH /api/applications/:id — partial update.
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

  const updates = pickWritable(body);
  if (Object.keys(updates).length === 0) {
    return badRequest("No writable fields provided.");
  }

  // RLS guarantees we can only touch our own rows.
  const { data, error } = await auth.supabase
    .from("applications")
    .update(updates)
    .eq("id", params.id)
    .select("*")
    .maybeSingle();

  if (error) return serverError(error.message);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ application: data });
}

// DELETE /api/applications/:id
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { error } = await auth.supabase
    .from("applications")
    .delete()
    .eq("id", params.id);

  if (error) return serverError(error.message);
  return NextResponse.json({ ok: true });
}
