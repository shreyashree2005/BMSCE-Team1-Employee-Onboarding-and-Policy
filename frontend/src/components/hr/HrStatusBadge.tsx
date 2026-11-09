import type { HrOnboardingStatus } from "../../types/hr";
import { Badge, type BadgeTone } from "../ui/Badge";

export const hrStatusMeta: Record<HrOnboardingStatus, { label: string; tone: BadgeTone }> = {
  at_risk: { label: "At risk", tone: "amber" },
  not_started: { label: "Not started", tone: "gray" },
  on_track: { label: "On track", tone: "blue" },
  completed: { label: "Completed", tone: "green" },
};

export function HrStatusBadge({ status }: { status: HrOnboardingStatus }) {
  const meta = hrStatusMeta[status];
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}
