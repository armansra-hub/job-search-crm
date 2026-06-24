import { NextResponse } from "next/server";
import { requireUser, badRequest, serverError } from "@/lib/api";

const TYPES = ["text", "number", "date", "select"];

// GET /api/field-defs — list (used by client refreshes if needed).
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.supabase
    .from("field_defs")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return serverError(error.message);
  return NextResponse.json({ field_defs: data });
}

// POST /api/field-defs — create a custom field definition (manual path; the
// voice path creates these via /api/apply-command's create_field_def op).
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const label = String(body.label || "").trim();
  if (!label) return badRequest("label is required.");
  const type = TYPES.includes(String(body.type)) ? String(body.type) : "text";

  // Derive a stable snake_case key from the label if none supplied.
  const key =
    String(body.key || "").trim() ||
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  if (!key) return badRequest("Could not derive a key from the label.");

  const options = Array.isArray(body.options) ? body.options : [];

  const { data, error } = await auth.supabase
    .from("field_defs")
    .insert({
      user_id: auth.user.id,
      key,
      label,
      type,
      options,
      applies_to: "applications",
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return badRequest(`A field with key "${key}" already exists.`);
    }
    return serverError(error.message);
  }
  return NextResponse.json({ field_def: data }, { status: 201 });
}
