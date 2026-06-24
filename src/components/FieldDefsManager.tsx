"use client";

import { useState } from "react";
import { apiPost, apiDelete } from "@/lib/client-api";
import type { FieldDef, FieldType } from "@/lib/types";

// Manual management of custom fields. The same field_defs are also creatable by
// voice ("track expected salary for each company") via the command flow.
export function FieldDefsManager({
  fieldDefs,
  onChanged,
}: {
  fieldDefs: FieldDef[];
  onChanged: () => void;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/field-defs", {
        label: label.trim(),
        type,
        options:
          type === "select"
            ? optionsText
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
      });
      setLabel("");
      setType("text");
      setOptionsText("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/api/field-defs/${id}`);
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
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Custom fields appear on every application&apos;s form and detail view.
        They are stored per-application in JSONB — the app never rewrites its own
        code to add a field.
      </p>

      {fieldDefs.length > 0 && (
        <ul className="space-y-1.5">
          {fieldDefs.map((fd) => (
            <li
              key={fd.id}
              className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium text-slate-800">{fd.label}</span>
                <span className="ml-2 text-xs text-slate-400">
                  {fd.key} · {fd.type}
                  {fd.type === "select" && fd.options.length > 0
                    ? ` (${fd.options.join(", ")})`
                    : ""}
                </span>
              </span>
              <button
                disabled={busy}
                onClick={() => remove(fd.id)}
                className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-200 hover:text-red-600 disabled:opacity-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-md border border-slate-200 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Add a field
        </p>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. Expected salary)"
          className={field}
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FieldType)}
            className={field}
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="select">Select</option>
          </select>
          {type === "select" && (
            <input
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="Options, comma-separated"
              className={field}
            />
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button
            disabled={busy}
            onClick={add}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Add field
          </button>
        </div>
      </div>
    </div>
  );
}
