"use client";

import { useState } from "react";
import { apiPost, apiPatch, apiDelete } from "@/lib/client-api";
import type { Contact } from "@/lib/types";

type Draft = {
  name: string;
  role: string;
  linkedin_url: string;
  email: string;
  notes: string;
};

const EMPTY: Draft = { name: "", role: "", linkedin_url: "", email: "", notes: "" };

export function ContactsSection({
  applicationId,
  contacts,
  onChanged,
}: {
  applicationId: string;
  contacts: Contact[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startAdd() {
    setDraft(EMPTY);
    setEditId(null);
    setAdding(true);
  }
  function startEdit(c: Contact) {
    setDraft({
      name: c.name,
      role: c.role ?? "",
      linkedin_url: c.linkedin_url ?? "",
      email: c.email ?? "",
      notes: c.notes ?? "",
    });
    setEditId(c.id);
    setAdding(true);
  }

  async function save() {
    if (!draft.name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: draft.name.trim(),
      role: draft.role || null,
      linkedin_url: draft.linkedin_url || null,
      email: draft.email || null,
      notes: draft.notes || null,
    };
    try {
      if (editId) {
        await apiPatch(`/api/contacts/${editId}`, payload);
      } else {
        await apiPost("/api/contacts", { application_id: applicationId, ...payload });
      }
      setAdding(false);
      setEditId(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/api/contacts/${id}`);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500";

  return (
    <div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {contacts.length === 0 ? (
        <p className="text-sm text-slate-400">No contacts yet.</p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-800">{c.name}</div>
                  {c.role && <div className="text-slate-500">{c.role}</div>}
                  <div className="mt-1 flex flex-wrap gap-3 text-xs">
                    {c.linkedin_url && (
                      <a
                        href={c.linkedin_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-600 hover:underline"
                      >
                        LinkedIn ↗
                      </a>
                    )}
                    {c.email && <span className="text-slate-500">{c.email}</span>}
                  </div>
                  {c.notes && <p className="mt-1 text-xs text-slate-500">{c.notes}</p>}
                </div>
                <div className="flex shrink-0 gap-1 text-xs">
                  <button
                    onClick={() => startEdit(c)}
                    className="rounded px-2 py-1 text-slate-500 hover:bg-slate-200"
                  >
                    Edit
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => remove(c.id)}
                    className="rounded px-2 py-1 text-slate-400 hover:bg-slate-200 hover:text-red-600 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-white p-3">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name *"
            className={field}
          />
          <input
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            placeholder="Role (e.g. Engineering Manager)"
            className={field}
          />
          <input
            value={draft.linkedin_url}
            onChange={(e) => setDraft({ ...draft, linkedin_url: e.target.value })}
            placeholder="LinkedIn URL (optional)"
            className={field}
          />
          <input
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            placeholder="Email (optional)"
            className={field}
          />
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="Notes"
            rows={2}
            className={field}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setAdding(false);
                setEditId(null);
              }}
              className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              disabled={busy}
              onClick={save}
              className="rounded bg-slate-900 px-3 py-1 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {editId ? "Save" : "Add contact"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={startAdd}
          className="mt-3 text-sm font-medium text-sky-600 hover:underline"
        >
          + Add contact
        </button>
      )}
    </div>
  );
}
