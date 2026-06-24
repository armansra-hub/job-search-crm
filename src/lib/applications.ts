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
