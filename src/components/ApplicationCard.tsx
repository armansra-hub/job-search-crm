"use client";

import { StageBadge } from "./StageBadge";
import { fmtRelative, isActive, isOverdue } from "@/lib/format";
import type { ApplicationWithChildren } from "@/lib/types";

export function ApplicationCard({
  app,
  onOpen,
}: {
  app: ApplicationWithChildren;
  onOpen: (app: ApplicationWithChildren) => void;
}) {
  const openTasks = app.tasks.filter(isActive);
  const overdueTasks = openTasks.filter((t) => isOverdue(t));
  const needsReview = app.email_events.some(
    (e) => e.classification === "needs_review",
  );

  return (
    <button
      onClick={() => onOpen(app)}
      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900">
            {app.company_name}
          </div>
          {app.role_title && (
            <div className="truncate text-sm text-slate-500">
              {app.role_title}
            </div>
          )}
        </div>
        <StageBadge stage={app.stage} />
      </div>

      {app.jd_summary && (
        <p className="mt-2 line-clamp-2 text-xs text-slate-500">
          {app.jd_summary}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        {app.follow_up_due && (
          <span
            className={
              new Date(app.follow_up_due) < new Date()
                ? "font-medium text-red-600"
                : ""
            }
          >
            Follow up {fmtRelative(app.follow_up_due)}
          </span>
        )}
        <span>Last contact {fmtRelative(app.last_contact_at)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {overdueTasks.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            {overdueTasks.length} overdue
          </span>
        )}
        {openTasks.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {openTasks.length} open task{openTasks.length > 1 ? "s" : ""}
          </span>
        )}
        {app.contacts.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {app.contacts.length} contact{app.contacts.length > 1 ? "s" : ""}
          </span>
        )}
        {needsReview && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            needs review
          </span>
        )}
        {!app.sent_confirmed && app.stage === "applied" && (
          <span
            title="The watcher has not yet confirmed your application email was sent."
            className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-400 ring-1 ring-inset ring-slate-200"
          >
            unconfirmed send
          </span>
        )}
      </div>
    </button>
  );
}
