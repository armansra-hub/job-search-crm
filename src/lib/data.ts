import { createClient } from "@/lib/supabase/server";
import type {
  ApplicationWithChildren,
  EmailEvent,
  FieldDef,
} from "@/lib/types";

// Server-side data access. RLS scopes every query to the logged-in user, so
// we never filter by user_id by hand here.

export async function getApplications(): Promise<ApplicationWithChildren[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("applications")
    .select(
      "*, contacts(*), tasks(*), email_events(*)",
    )
    .order("updated_at", { ascending: false });

  if (error) {
    // Surface loudly in dev; the page shows an error banner.
    console.error("getApplications failed:", error.message);
    throw new Error(error.message);
  }

  // Normalize children ordering for stable rendering.
  return (data ?? []).map((app) => ({
    ...(app as ApplicationWithChildren),
    contacts: (app.contacts ?? []).sort((a: any, b: any) =>
      a.created_at < b.created_at ? -1 : 1,
    ),
    tasks: (app.tasks ?? []).sort((a: any, b: any) => {
      // Open tasks first, then by due date.
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      return (a.due_at ?? "") < (b.due_at ?? "") ? -1 : 1;
    }),
    email_events: (app.email_events ?? []).sort((a: any, b: any) =>
      (a.last_message_at ?? a.created_at) > (b.last_message_at ?? b.created_at)
        ? -1
        : 1,
    ),
  }));
}

export async function getFieldDefs(): Promise<FieldDef[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("field_defs")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("getFieldDefs failed:", error.message);
    return [];
  }
  return (data ?? []) as FieldDef[];
}

// needs_review email events that are not yet linked to an application.
export async function getNeedsReviewEvents(): Promise<EmailEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("email_events")
    .select("*")
    .eq("classification", "needs_review")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getNeedsReviewEvents failed:", error.message);
    return [];
  }
  return (data ?? []) as EmailEvent[];
}
