import type { HrOnboardingStatus, HrStatusCounts } from "../types/hr";

/** Order HR reviews employees in: those needing attention first (the API sorts the same way). */
export const HR_STATUS_ORDER: HrOnboardingStatus[] = ["at_risk", "not_started", "on_track", "completed"];

const COUNT_KEYS: Record<HrOnboardingStatus, keyof HrStatusCounts> = {
  at_risk: "atRisk",
  not_started: "notStarted",
  on_track: "onTrack",
  completed: "completed",
};

export function countForStatus(counts: HrStatusCounts, status: HrOnboardingStatus): number {
  return counts[COUNT_KEYS[status]];
}
