"use client";

import { useState } from "react";
import { apiPost, apiPatch } from "@/lib/client-api";
import { JdSummarizer } from "./JdSummarizer";
import { STAGES, STAGE_LABELS } from "@/lib/constants";
import type { Application, FieldDef, Stage } from "@/lib/types";

// Shared field primitives.
function Text({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
      />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
      />
    </label>
  );
}

// datetime-local <-> ISO helpers.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function ApplicationForm({
  existing,
  fieldDefs,
  onSaved,
  onCancel,
}: {
  existing?: Application;
  fieldDefs: FieldDef[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [company, setCompany] = useState(existing?.company_name ?? "");
  const [role, setRole] = useState(existing?.role_title ?? "");
  const [stage, setStage] = useState<Stage>(existing?.stage ?? "applied");
  const [source, setSource] = useState(existing?.source ?? "");
  const [dateApplied, setDateApplied] = useState(existing?.date_applied ?? "");
  const [emailDomain, setEmailDomain] = useState(existing?.email_domain ?? "");
  const [salary, setSalary] = useState(existing?.salary_target ?? "");
  const [jdUrl, setJdUrl] = useState(existing?.jd_url ?? "");
  const [jdSummary, setJdSummary] = useState(existing?.jd_summary ?? "");
  const [outreach, setOutreach] = useState(existing?.outreach_notes ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [followUp, setFollowUp] = useState(
    toLocalInput(existing?.follow_up_due ?? null),
  );
  const [custom, setCustom] = useState<Record<string, unknown>>(
    existing?.custom_fields ?? {},
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!company.trim()) {
      setError("Company name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      company_name: company.trim(),
      role_title: role || null,
      stage,
      source: source || null,
      date_applied: dateApplied || null,
      email_domain: emailDomain.trim().toLowerCase() || null,
      salary_target: salary || null,
      jd_url: jdUrl || null,
      jd_summary: jdSummary || null,
      outreach_notes: outreach || null,
      notes: notes || null,
      follow_up_due: fromLocalInput(followUp),
      custom_fields: custom,
    };
    try {
      if (existing) {
        await apiPatch(`/api/applications/${existing.id}`, payload);
      } else {
        await apiPost("/api/applications", payload);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <Text label="Company *" value={company} onChange={setCompany} placeholder="Anduril" />
      <div className="grid grid-cols-2 gap-3">
        <Text label="Role" value={role} onChange={setRole} placeholder="Forward Deployed Engineer" />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">Stage</span>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as Stage)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Text label="Source" value={source} onChange={setSource} placeholder="linkedin / referral / site" />
        <Text label="Date applied" type="date" value={dateApplied} onChange={setDateApplied} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Text
          label="Email domain"
          value={emailDomain}
          onChange={setEmailDomain}
          placeholder="anduril.com"
        />
        <Text label="Salary target" value={salary} onChange={setSalary} placeholder="$190k base" />
      </div>
      <Text label="JD URL" value={jdUrl} onChange={setJdUrl} placeholder="https://…" />
      <JdSummarizer url={jdUrl} onSummary={setJdSummary} />
      <Area label="JD summary" value={jdSummary} onChange={setJdSummary} />
      <Area
        label="Outreach notes (your thinking — captured, not drafted for you)"
        value={outreach}
        onChange={setOutreach}
        placeholder="Who to reach out to, your angle, why you fit…"
      />
      <Text label="Follow-up due" type="datetime-local" value={followUp} onChange={setFollowUp} />
      <Area label="Notes" value={notes} onChange={setNotes} />

      {fieldDefs.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Custom fields
          </p>
          <div className="grid grid-cols-2 gap-3">
            {fieldDefs.map((fd) => (
              <CustomFieldInput
                key={fd.id}
                fd={fd}
                value={custom[fd.key]}
                onChange={(v) => setCustom((c) => ({ ...c, [fd.key]: v }))}
              />
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : existing ? "Save changes" : "Create"}
        </button>
      </div>
    </div>
  );
}

function CustomFieldInput({
  fd,
  value,
  onChange,
}: {
  fd: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const common =
    "w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500";
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600">{fd.label}</span>
      {fd.type === "select" ? (
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={common}
        >
          <option value="">—</option>
          {fd.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={fd.type === "number" ? "number" : fd.type === "date" ? "date" : "text"}
          value={String(value ?? "")}
          onChange={(e) =>
            onChange(
              fd.type === "number"
                ? e.target.value === ""
                  ? null
                  : Number(e.target.value)
                : e.target.value,
            )
          }
          className={common}
        />
      )}
    </label>
  );
}
