import { NextResponse } from "next/server";
import { requireUser, badRequest, serverError, ownsApplication } from "@/lib/api";

// POST /api/contacts — paste in a contact (manual; NO sourcing).
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
  const name = String(body.name || "").trim();
  if (!application_id) return badRequest("application_id is required.");
  if (!name) return badRequest("name is required.");
  if (!(await ownsApplication(auth.supabase, application_id))) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const { data, error } = await auth.supabase
    .from("contacts")
    .insert({
      application_id,
      name,
      role: body.role ?? null,
      linkedin_url: body.linkedin_url ?? null,
      email: body.email ?? null,
      notes: body.notes ?? null,
    })
    .select("*")
    .single();

  if (error) return serverError(error.message);
  return NextResponse.json({ contact: data }, { status: 201 });
}
