import type { Stage } from "./types";

// The three board views are filters over `stage`.
export const VIEW_DEFS = {
  waiting: {
    label: "Waiting on response",
    description: "Applied, no substantive reply yet.",
    stages: ["applied"] as Stage[],
  },
  conversation: {
    label: "In conversation",
    description: "They replied — actively in process.",
    stages: ["responded", "screen", "interview", "final", "offer"] as Stage[],
  },
  closed: {
    label: "Closed",
    description: "Rejected or withdrawn.",
    stages: ["rejected", "withdrawn"] as Stage[],
  },
} as const;

export type ViewKey = keyof typeof VIEW_DEFS;

export const STAGES: Stage[] = [
  "applied",
  "responded",
  "screen",
  "interview",
  "final",
  "offer",
  "rejected",
  "withdrawn",
];

export const STAGE_LABELS: Record<Stage, string> = {
  applied: "Applied",
  responded: "Responded",
  screen: "Screen",
  interview: "Interview",
  final: "Final",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

// Tailwind text/bg classes per stage (kept here so cards stay declarative).
export const STAGE_BADGE: Record<Stage, string> = {
  applied: "bg-slate-100 text-slate-700 ring-slate-200",
  responded: "bg-sky-100 text-sky-800 ring-sky-200",
  screen: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  interview: "bg-violet-100 text-violet-800 ring-violet-200",
  final: "bg-purple-100 text-purple-800 ring-purple-200",
  offer: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  rejected: "bg-red-100 text-red-800 ring-red-200",
  withdrawn: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function viewForStage(stage: Stage): ViewKey {
  if (VIEW_DEFS.closed.stages.includes(stage)) return "closed";
  if (VIEW_DEFS.conversation.stages.includes(stage)) return "conversation";
  return "waiting";
}

// Default staleness threshold (days) for the digest's "gone quiet" section.
export const DEFAULT_STALE_DAYS = 7;
