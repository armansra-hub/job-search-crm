// Shared domain types — mirror supabase/schema.sql. Kept hand-written (rather
// than generated) so the build has no dependency on the Supabase CLI.

export type Stage =
  | "applied"
  | "responded"
  | "screen"
  | "interview"
  | "final"
  | "offer"
  | "rejected"
  | "withdrawn";

export type TaskType = "linkedin_outreach" | "follow_up" | "custom";
export type TaskStatus = "open" | "done" | "snoozed";
export type EmailDirection = "in" | "out";
export type EmailClassification =
  | "reply"
  | "interview_invite"
  | "rejection"
  | "linkedin_notice"
  | "other"
  | "needs_review";
export type FieldType = "text" | "number" | "date" | "select";

export interface LinkItem {
  label: string;
  url: string;
}

export interface Application {
  id: string;
  user_id: string;
  company_name: string;
  role_title: string | null;
  jd_url: string | null;
  jd_summary: string | null;
  source: string | null;
  date_applied: string | null; // ISO date (YYYY-MM-DD)
  stage: Stage;
  email_domain: string | null;
  salary_target: string | null;
  links: LinkItem[];
  notes: string | null;
  outreach_notes: string | null;
  custom_fields: Record<string, unknown>;
  follow_up_due: string | null; // ISO timestamp
  last_contact_at: string | null;
  sent_confirmed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  application_id: string;
  name: string;
  role: string | null;
  linkedin_url: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  application_id: string;
  title: string;
  type: TaskType;
  due_at: string | null;
  notes: string | null;
  status: TaskStatus;
  created_at: string;
  completed_at: string | null;
}

export interface EmailEvent {
  id: string;
  user_id: string;
  application_id: string | null;
  gmail_thread_id: string | null;
  last_message_at: string | null;
  direction: EmailDirection | null;
  classification: EmailClassification;
  summary: string | null;
  raw_snippet: string | null;
  notified: boolean;
  created_at: string;
}

export interface FieldDef {
  id: string;
  user_id: string;
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  applies_to: string;
  created_at: string;
}

// An application with its children joined — what the board renders.
export interface ApplicationWithChildren extends Application {
  contacts: Contact[];
  tasks: Task[];
  email_events: EmailEvent[];
}
