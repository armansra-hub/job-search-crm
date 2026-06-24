"use client";

// Read-only detail drawer (Milestone 2). Milestones 3–4 layer interactive
// controls (edit application, task actions, contact CRUD, JD summarize) into
// the sections marked below.

import { useEffect, useState } from "react";
import { StageBadge } from "./StageBadge";
import { Modal } from "./Modal";
import { ApplicationForm } from "./ApplicationForm";
import { TasksSection } from "./TasksSection";
import { ContactsSection } from "./ContactsSection";
import { fmtDate, fmtDateTime, fmtRelative, isActive } from "@/lib/format";
import type { ApplicationWithChildren, FieldDef } from "@/lib/types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="border-t border-slate-100 px-5 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DetailDrawer({
  app,
  fieldDefs,
  onClose,
  onChanged,
}: {
  app: ApplicationWithChildren;
  fieldDefs: FieldDef[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);

  // Close on Escape (but not while the edit modal is open — it closes itself).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editing]);

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/20"
        onClick={onClose}
        aria-hidden
      />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-xl board-scroll">
        {/* header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                {app.company_name}
              </h2>
              <StageBadge stage={app.stage} />
            </div>
            {app.role_title && (
              <p className="text-sm text-slate-500">{app.role_title}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setEditing(true)}
              className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
            >
              Edit
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* meta grid */}
        <Section title="Details">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Source">{app.source || "—"}</Field>
            <Field label="Applied">{fmtDate(app.date_applied)}</Field>
            <Field label="Email domain">{app.email_domain || "—"}</Field>
            <Field label="Salary target">{app.salary_target || "—"}</Field>
            <Field label="Follow-up due">
              {app.follow_up_due ? (
                <span
                  className={
                    new Date(app.follow_up_due) < new Date()
                      ? "font-medium text-red-600"
                      : ""
                  }
                >
                  {fmtDateTime(app.follow_up_due)} ({fmtRelative(app.follow_up_due)})
                </span>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Last contact">
              {app.last_contact_at
                ? `${fmtDateTime(app.last_contact_at)} (${fmtRelative(app.last_contact_at)})`
                : "—"}
            </Field>
            <Field label="Send confirmed">
              {app.sent_confirmed ? "Yes" : "Not yet"}
            </Field>
          </dl>

          {app.links.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {app.links.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200"
                >
                  {l.label || l.url} ↗
                </a>
              ))}
            </div>
          )}
        </Section>

        {/* JD summary */}
        <Section title="Job description">
          {app.jd_url && (
            <a
              href={app.jd_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-sky-600 hover:underline"
            >
              {app.jd_url} ↗
            </a>
          )}
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
            {app.jd_summary || "No summary yet."}
          </p>
        </Section>

        {/* Outreach notes — the captured thinking. NOT a drafted message. */}
        <Section title="Outreach notes (your thinking — copy out, don't auto-send)">
          <p className="whitespace-pre-wrap text-sm text-slate-700">
            {app.outreach_notes || "No outreach notes yet."}
          </p>
        </Section>

        {/* Custom fields driven by field_defs */}
        {fieldDefs.length > 0 && (
          <Section title="Custom fields">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {fieldDefs.map((fd) => (
                <Field key={fd.id} label={fd.label}>
                  {formatCustom(app.custom_fields?.[fd.key])}
                </Field>
              ))}
            </dl>
          </Section>
        )}

        {/* Notes */}
        {app.notes && (
          <Section title="Notes">
            <p className="whitespace-pre-wrap text-sm text-slate-700">
              {app.notes}
            </p>
          </Section>
        )}

        {/* Contacts (interactive) */}
        <Section title={`Contacts (${app.contacts.length})`}>
          <ContactsSection
            applicationId={app.id}
            contacts={app.contacts}
            onChanged={onChanged}
          />
        </Section>

        {/* Tasks (interactive) */}
        <Section title={`Tasks (${app.tasks.filter(isActive).length} open)`}>
          <TasksSection
            applicationId={app.id}
            tasks={app.tasks}
            onChanged={onChanged}
          />
        </Section>

        {/* Email conversation box + running thread summary */}
        <Section title={`Email conversation (${app.email_events.length})`}>
          {app.email_events.length === 0 ? (
            <p className="text-sm text-slate-400">
              No email events yet. The background watcher writes here when mail
              arrives from {app.email_domain || "this company"}.
            </p>
          ) : (
            <ul className="space-y-2">
              {app.email_events.map((e) => (
                <li
                  key={e.id}
                  className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {e.classification}
                      {e.direction ? ` · ${e.direction}` : ""}
                    </span>
                    <span>{fmtDateTime(e.last_message_at ?? e.created_at)}</span>
                  </div>
                  {e.summary && (
                    <p className="mt-1 text-slate-700">{e.summary}</p>
                  )}
                  {e.raw_snippet && (
                    <p className="mt-1 text-xs italic text-slate-400">
                      {e.raw_snippet}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </aside>

      {editing && (
        <Modal title={`Edit ${app.company_name}`} onClose={() => setEditing(false)}>
          <ApplicationForm
            existing={app}
            fieldDefs={fieldDefs}
            onSaved={() => {
              setEditing(false);
              onChanged();
            }}
            onCancel={() => setEditing(false)}
          />
        </Modal>
      )}
    </div>
  );
}

function formatCustom(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
