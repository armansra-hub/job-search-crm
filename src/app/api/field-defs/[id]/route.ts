import { NextResponse } from "next/server";
import { requireUser, serverError } from "@/lib/api";

// DELETE /api/field-defs/:id — removes the field definition. Existing values
// already stored in applications.custom_fields are left untouched (harmless
// orphaned keys); the UI simply stops rendering an input for them.
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { error } = await auth.supabase
    .from("field_defs")
    .delete()
    .eq("id", params.id);
  if (error) return serverError(error.message);
  return NextResponse.json({ ok: true });
}
