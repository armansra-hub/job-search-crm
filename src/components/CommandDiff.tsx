"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { apiPost } from "@/lib/client-api";
import type { CommandPlan, Operation } from "@/lib/command";

const KIND_LABELS: Record<string, string> = {
  create_application: "New application",
  update_application: "Update application",
  create_task: "New task",
  create_contact: "New contact",
  append_outreach_notes: "Add outreach notes",
  create_field_def: "New custom field",
  set_custom_field: "Set custom field",
};

// Renders the proposed diff and applies it on confirm. This is the
// confirm-before-apply gate — nothing is written until the user clicks Apply.
export function CommandDiff({
  transcript,
  plan,
  onClose,
  onApplied,
}: {
  transcript: string;
  plan: CommandPlan;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const res = await apiPost("/api/apply-command", {
        operations: plan.operations,
      });
      if (!res.ok) {
        const failedLabels = (res.results || [])
          .filter((r: any) => !r.ok)
          .map((r: any) => `${r.label}: ${r.error}`)
          .join("; ");
        throw new Error(failedLabels || "Some changes failed.");
      }
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Modal title="Review proposed changes" onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <span className="font-medium text-slate-600">You said:</span> “{transcript}”
        </div>

        <p className="text-sm text-slate-700">{plan.summary}</p>

        {plan.warnings.length > 0 && (
          <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {plan.warnings.map((w, i) => (
              <li key={i}>⚠ {w}</li>
            ))}
          </ul>
        )}

        {plan.operations.length === 0 ? (
          <p className="text-sm text-slate-400">
            No changes proposed. Try rephrasing.
          </p>
        ) : (
          <ul className="space-y-2">
            {plan.operations.map((op, i) => (
              <OperationRow key={i} op={op} />
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={applying || plan.operations.length === 0}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {applying ? "Applying…" : `Apply ${plan.operations.length} change${plan.operations.length > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function OperationRow({ op }: { op: Operation }) {
  return (
    <li className="rounded-md border border-slate-200 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
          {KIND_LABELS[op.kind] ?? op.kind}
        </span>
        <span className="text-slate-800">{op.label}</span>
      </div>
      <OperationDetail op={op} />
    </li>
  );
}

// Show the salient payload so the user can catch a misheard company name etc.
function OperationDetail({ op }: { op: Operation }) {
  const rows: [string, string][] = [];
  const o = op as any;
  if (o.fields?.company_name) rows.push(["Company", o.fields.company_name]);
  if (o.fields?.role_title) rows.push(["Role", o.fields.role_title]);
  if (o.fields?.stage) rows.push(["Stage", o.fields.stage]);
  if (o.fields?.email_domain) rows.push(["Email domain", o.fields.email_domain]);
  if (o.fields?.outreach_notes) rows.push(["Outreach notes", o.fields.outreach_notes]);
  if (o.title) rows.push(["Title", o.title]);
  if (o.due_at) rows.push(["Due", new Date(o.due_at).toLocaleString()]);
  if (o.name) rows.push(["Name", o.name]);
  if (o.role) rows.push(["Role", o.role]);
  if (o.linkedin_url) rows.push(["LinkedIn", o.linkedin_url]);
  if (o.text) rows.push(["Notes", o.text]);
  if (o.field_label) rows.push(["Field", `${o.field_label} (${o.type})`]);
  if (o.key && op.kind === "set_custom_field") rows.push([o.key, String(o.value)]);

  if (rows.length === 0) return null;
  return (
    <dl className="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs text-slate-500">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-slate-400">{k}</dt>
          <dd className="text-slate-700">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
