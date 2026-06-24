// Shared "structured diff" operation model for the voice/text command flow.
// The parser (/api/parse-command) PROPOSES these; the UI shows them; the user
// confirms; /api/apply-command WRITES them. Nothing mutates without confirm.

import type { FieldType, Stage, TaskType } from "./types";

// Fields the parser may set on an application.
export interface AppFields {
  company_name?: string;
  role_title?: string | null;
  jd_url?: string | null;
  jd_summary?: string | null;
  source?: string | null;
  date_applied?: string | null;
  stage?: Stage;
  email_domain?: string | null;
  salary_target?: string | null;
  notes?: string | null;
  outreach_notes?: string | null;
  follow_up_due?: string | null;
}

// A child op targets an application either by an existing id OR by a temp_id
// of a create_application op proposed in the same batch.
interface AppRef {
  application_id?: string;
  application_ref?: string; // matches a create_application.temp_id in this batch
}

export type Operation =
  | ({
      kind: "create_application";
      temp_id?: string;
      label: string;
      fields: AppFields;
    })
  | {
      kind: "update_application";
      application_id: string;
      label: string;
      fields: AppFields;
    }
  | ({
      kind: "create_task";
      label: string;
      title: string;
      type: TaskType;
      due_at?: string | null;
      notes?: string | null;
    } & AppRef)
  | ({
      kind: "create_contact";
      label: string;
      name: string;
      role?: string | null;
      linkedin_url?: string | null;
      email?: string | null;
      notes?: string | null;
    } & AppRef)
  | ({
      kind: "append_outreach_notes";
      label: string;
      text: string;
    } & AppRef)
  | {
      kind: "create_field_def";
      label: string;
      key: string;
      field_label: string;
      type: FieldType;
      options?: string[];
    }
  | ({
      kind: "set_custom_field";
      label: string;
      key: string;
      value: unknown;
    } & AppRef)
  | {
      kind: "delete_application";
      application_id: string;
      label: string;
    };

export interface CommandPlan {
  summary: string;
  operations: Operation[];
  warnings: string[];
}

export const OPERATION_KINDS = [
  "create_application",
  "update_application",
  "create_task",
  "create_contact",
  "append_outreach_notes",
  "create_field_def",
  "set_custom_field",
  "delete_application",
] as const;

// A compact snapshot of current state sent to the parser so it can resolve
// references like "move Anduril to interviewing" to a concrete id.
export interface StateSnapshotApp {
  id: string;
  company_name: string;
  role_title: string | null;
  stage: Stage;
  email_domain: string | null;
}
export interface StateSnapshot {
  applications: StateSnapshotApp[];
  field_defs: { key: string; label: string; type: FieldType }[];
}
