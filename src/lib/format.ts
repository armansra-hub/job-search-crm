import type { Task } from "./types";

// Small, dependency-free date/time helpers. All relative to "now" on render.

// A task is "active" until it is explicitly marked done. Snoozing pushes
// due_at into the future and flips status to 'snoozed'; when that later due
// passes, the task is active+overdue again so nothing silently disappears.
export function isActive(task: Pick<Task, "status">): boolean {
  return task.status !== "done";
}

export function isOverdue(task: Pick<Task, "status" | "due_at">): boolean {
  return isActive(task) && !!task.due_at && new Date(task.due_at) < new Date();
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Human "in 2 days" / "3 days ago" relative phrasing.
export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = d.getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(diffDays) >= 1) return rtf.format(diffDays, "day");
  const diffHours = Math.round(diffMs / 3_600_000);
  if (Math.abs(diffHours) >= 1) return rtf.format(diffHours, "hour");
  const diffMin = Math.round(diffMs / 60_000);
  return rtf.format(diffMin, "minute");
}

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}
