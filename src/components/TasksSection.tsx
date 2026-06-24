"use client";

import { useState } from "react";
import { apiPost, apiPatch, apiDelete } from "@/lib/client-api";
import { fmtDateTime, isActive, isOverdue } from "@/lib/format";
import type { Task, TaskType } from "@/lib/types";

const TYPE_LABELS: Record<TaskType, string> = {
  linkedin_outreach: "LinkedIn outreach",
  follow_up: "Follow up",
  custom: "Custom",
};

export function TasksSection({
  applicationId,
  tasks,
  onChanged,
}: {
  applicationId: string;
  tasks: Task[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("follow_up");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, key: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  async function addTask() {
    if (!title.trim()) return;
    await run(async () => {
      await apiPost("/api/tasks", {
        application_id: applicationId,
        title: title.trim(),
        type,
        due_at: due ? new Date(due).toISOString() : null,
      });
      setTitle("");
      setDue("");
      setType("follow_up");
      setAdding(false);
    }, "add");
  }

  return (
    <div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {tasks.length === 0 ? (
        <p className="text-sm text-slate-400">No tasks yet.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="rounded-md border border-slate-100 px-3 py-2 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div
                    className={
                      t.status === "done"
                        ? "text-slate-400 line-through"
                        : "text-slate-800"
                    }
                  >
                    {t.title}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {TYPE_LABELS[t.type]} ·{" "}
                    {t.due_at ? `due ${fmtDateTime(t.due_at)}` : "no due date"}
                    {isOverdue(t) && (
                      <span className="ml-2 font-medium text-red-600">overdue</span>
                    )}
                    {t.status === "snoozed" && (
                      <span className="ml-2 text-amber-600">snoozed</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {isActive(t) ? (
                  <>
                    <button
                      disabled={busy === t.id}
                      onClick={() =>
                        run(
                          () => apiPatch(`/api/tasks/${t.id}`, { action: "complete" }),
                          t.id,
                        )
                      }
                      className="rounded bg-emerald-600 px-2 py-1 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      Complete
                    </button>
                    <SnoozeButton
                      disabled={busy === t.id}
                      onSnooze={(days) =>
                        run(
                          () =>
                            apiPatch(`/api/tasks/${t.id}`, {
                              action: "snooze",
                              due_at: new Date(
                                Date.now() + days * 86_400_000,
                              ).toISOString(),
                            }),
                          t.id,
                        )
                      }
                    />
                  </>
                ) : (
                  <button
                    disabled={busy === t.id}
                    onClick={() =>
                      run(
                        () => apiPatch(`/api/tasks/${t.id}`, { action: "reopen" }),
                        t.id,
                      )
                    }
                    className="rounded bg-slate-200 px-2 py-1 font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                  >
                    Reopen
                  </button>
                )}
                <button
                  disabled={busy === t.id}
                  onClick={() =>
                    run(() => apiDelete(`/api/tasks/${t.id}`), t.id)
                  }
                  className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TaskType)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="follow_up">Follow up</option>
              <option value="linkedin_outreach">LinkedIn outreach</option>
              <option value="custom">Custom</option>
            </select>
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setAdding(false)}
              className="rounded px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              disabled={busy === "add"}
              onClick={addTask}
              className="rounded bg-slate-900 px-3 py-1 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Add task
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 text-sm font-medium text-sky-600 hover:underline"
        >
          + Add task
        </button>
      )}
    </div>
  );
}

function SnoozeButton({
  onSnooze,
  disabled,
}: {
  onSnooze: (days: number) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="rounded bg-slate-200 px-2 py-1 font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50"
      >
        Snooze ▾
      </button>
      {open && (
        <span className="absolute left-0 top-full z-10 mt-1 flex flex-col rounded-md border border-slate-200 bg-white shadow-lg">
          {[1, 3, 7].map((d) => (
            <button
              key={d}
              onClick={() => {
                setOpen(false);
                onSnooze(d);
              }}
              className="whitespace-nowrap px-3 py-1 text-left hover:bg-slate-50"
            >
              +{d} day{d > 1 ? "s" : ""}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
