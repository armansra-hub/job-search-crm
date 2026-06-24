"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApplicationCard } from "./ApplicationCard";
import { DetailDrawer } from "./DetailDrawer";
import { Modal } from "./Modal";
import { ApplicationForm } from "./ApplicationForm";
import { FieldDefsManager } from "./FieldDefsManager";
import { NeedsReviewModal } from "./NeedsReviewModal";
import { VoiceBar } from "./VoiceBar";
import { VIEW_DEFS, type ViewKey } from "@/lib/constants";
import type {
  ApplicationWithChildren,
  EmailEvent,
  FieldDef,
} from "@/lib/types";

const VIEW_ORDER: ViewKey[] = ["waiting", "conversation", "closed"];

export function Board({
  applications,
  fieldDefs,
  needsReview,
}: {
  applications: ApplicationWithChildren[];
  fieldDefs: FieldDef[];
  needsReview: EmailEvent[];
}) {
  const router = useRouter();
  const onChanged = () => router.refresh();
  const [view, setView] = useState<ViewKey>("waiting");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [managingFields, setManagingFields] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const counts = useMemo(() => {
    const c: Record<ViewKey, number> = { waiting: 0, conversation: 0, closed: 0 };
    for (const app of applications) {
      for (const v of VIEW_ORDER) {
        if (VIEW_DEFS[v].stages.includes(app.stage)) c[v]++;
      }
    }
    return c;
  }, [applications]);

  const visible = useMemo(
    () =>
      applications.filter((a) => VIEW_DEFS[view].stages.includes(a.stage)),
    [applications, view],
  );

  const openApp = applications.find((a) => a.id === openId) || null;

  return (
    <div>
      {/* toolbar — voice/text command bar + manual create */}
      <div className="mb-5 space-y-3">
        <VoiceBar onChanged={onChanged} />
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-900">Pipeline</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setManagingFields(true)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Fields
            </button>
            <button
              onClick={() => setCreating(true)}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              + New application
            </button>
          </div>
        </div>
      </div>

      {/* needs-review banner */}
      {needsReview.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            <span className="font-medium">{needsReview.length}</span> email
            {needsReview.length > 1 ? "s" : ""} need review — the watcher could not
            confidently match {needsReview.length > 1 ? "them" : "it"} to a company.
          </span>
          <button
            onClick={() => setReviewing(true)}
            className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
          >
            Review
          </button>
        </div>
      )}

      {/* view tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {VIEW_ORDER.map((v) => {
          const active = v === view;
          return (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                active
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {VIEW_DEFS[v].label}
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {counts[v]}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mb-3 text-sm text-slate-500">{VIEW_DEFS[view].description}</p>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          Nothing here yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              onOpen={() => setOpenId(app.id)}
            />
          ))}
        </div>
      )}

      {openApp && (
        <DetailDrawer
          app={openApp}
          fieldDefs={fieldDefs}
          onClose={() => setOpenId(null)}
          onChanged={onChanged}
        />
      )}

      {creating && (
        <Modal title="New application" onClose={() => setCreating(false)}>
          <ApplicationForm
            fieldDefs={fieldDefs}
            onSaved={() => {
              setCreating(false);
              onChanged();
            }}
            onCancel={() => setCreating(false)}
          />
        </Modal>
      )}

      {managingFields && (
        <Modal title="Custom fields" onClose={() => setManagingFields(false)}>
          <FieldDefsManager fieldDefs={fieldDefs} onChanged={onChanged} />
        </Modal>
      )}

      {reviewing && (
        <NeedsReviewModal
          events={needsReview}
          applications={applications}
          onClose={() => setReviewing(false)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
