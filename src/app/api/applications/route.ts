import { NextResponse } from "next/server";
import { requireUser, badRequest, serverError } from "@/lib/api";

// Whitelist of columns a client may set/update on an application.
const WRITABLE = [
  "company_name",
  "role_title",
  "jd_url",
  "jd_summary",
  "source",
  "date_applied",
  "stage",
  "email_domain",
  "salary_target",
  "links",
  "notes",
  "outreach_notes",
  "custom_fields",
  "follow_up_due",
  "last_contact_at",
  "sent_confirmed",
] as const;

export function pickWritable(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of WRITABLE) {
    if (k in body) out[k] = body[k];
  }
  return out;
}

// POST /api/applications — create a new application.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const company_name = String(body.company_name || "").trim();
  if (!company_name) return badRequest("company_name is required.");

  const row = {
    ...pickWritable(body),
    company_name,
    user_id: auth.user.id,
  };

  const { data, error } = await auth.supabase
    .from("applications")
    .insert(row)
    .select("*")
    .single();

  if (error) return serverError(error.message);
  return NextResponse.json({ application: data }, { status: 201 });
}
