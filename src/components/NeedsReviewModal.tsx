"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { apiPatch } from "@/lib/client-api";
import { fmtDateTime } from "@/lib/format";
import type {
  ApplicationWithChildren,
  EmailClassification,
  EmailEvent,
} from "@/lib/types";

// Confirm-or-dismiss UI for emails the watcher could not confidently match.
// Hard behavior #2: ambiguous mail is NEVER auto-applied — you resolve it here.
const CLASSES: EmailClassification[] = [
  "reply",
  "interview_invite",
  "rejection",
  "linkedin_notice",
  "other",
];

export function NeedsReviewModal({
  events,
  applications,
  onClose,
  onChanged,
}: {
  events: EmailEvent[];
  applications: ApplicationWithChildren[];
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Modal title={`Needs review (${events.length})`} onClose={onClose}>
      {events.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing to review. 🎉</p>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <ReviewRow
              key={e.id}
              event={e}
              applications={applications}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </Modal>
  );
}

function ReviewRow({
  event,
  applications,
  onChanged,
}: {
  event: EmailEvent;
  applications: ApplicationWithChildren[];
  onChanged: () => void;
}) {
  const [appId, setAppId] = useState("");
  const [klass, setKlass] = useState<EmailClassification>("reply");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function link() {
    if (!appId) {
      setError("Pick a company first.");
      return;
    }
    await run({ application_id: appId, classification: klass });
  }
  async function dismiss() {
    // Leave it unlinked but no longer flagged for review.
    await run({ classification: "other" });
  }
  async function run(patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/api/email-events/${event.id}`, patch);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-slate-500";

  return (
    <li className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
      <div className="text-xs text-slate-500">
        {fmtDateTime(event.last_message_at ?? event.created_at)}
      </div>
      <p className="mt-0.5 text-slate-800">{event.summary || "(no summary)"}</p>
      {event.raw_snippet && (
        <p className="mt-1 text-xs italic text-slate-500">{event.raw_snippet}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          className={field}
        >
          <option value="">Link to company…</option>
          {applications.map((a) => (
            <option key={a.id} value={a.id}>
              {a.company_name}
              {a.role_title ? ` — ${a.role_title}` : ""}
            </option>
          ))}
        </select>
        <select
          value={klass}
          onChange={(e) => setKlass(e.target.value as EmailClassification)}
          className={field}
        >
          {CLASSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          disabled={busy}
          onClick={link}
          className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Link
        </button>
        <button
          disabled={busy}
          onClick={dismiss}
          className="rounded px-3 py-1 text-xs text-slate-500 hover:bg-amber-100 disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </li>
  );
}
