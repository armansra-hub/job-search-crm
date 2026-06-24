import { STAGE_BADGE, STAGE_LABELS } from "@/lib/constants";
import type { Stage } from "@/lib/types";

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STAGE_BADGE[stage]}`}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
