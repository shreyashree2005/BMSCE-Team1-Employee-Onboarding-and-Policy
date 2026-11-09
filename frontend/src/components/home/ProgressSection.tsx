import { Link } from "react-router-dom";
import type { OnboardingTask } from "../../types/dashboard";
import { percentage } from "../../utils/format";
import { getTaskCounts } from "../../utils/onboarding";
import { ProgressRing } from "../ui/ProgressRing";
import { SectionHeader } from "../ui/SectionHeader";

/** Overall completion: a progress ring with the percentage, and total / completed / in progress / pending counts. */
export function ProgressSection({ tasks }: { tasks: OnboardingTask[] }) {
  const counts = getTaskCounts(tasks);
  const overall = percentage(counts.completed, counts.total);
  const statuses = [
    { key: "completed", label: "Completed", value: counts.completed, tile: "bg-emerald-50 ring-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
    { key: "in_progress", label: "In progress", value: counts.inProgress, tile: "bg-primary-50 ring-primary-100 text-primary-700", dot: "bg-primary-500" },
    { key: "pending", label: "Pending", value: counts.pending, tile: "bg-slate-50 ring-slate-200 text-slate-700", dot: "bg-slate-400" },
  ] as const;

  return (
    <section aria-labelledby="progress-heading" className="flex flex-col rounded-panel border border-line bg-white p-5 shadow-card sm:p-6">
      <SectionHeader id="progress-heading" title="Your Progress" description={`${counts.completed} of ${counts.total} tasks complete${counts.overdue ? ` · ${counts.overdue} overdue` : ""}`} />
      <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-5">
        <div className="relative rounded-full bg-gradient-to-br from-primary-50 to-white p-2.5 ring-1 ring-primary-100">
          <ProgressRing value={overall} size={136} strokeWidth={13} label="Overall onboarding progress">
            <span className="text-[30px] font-bold leading-none text-primary-700 tabular-nums">{overall}%</span>
            <span className="mt-1 text-[11.5px] font-medium text-slate-500">complete</span>
          </ProgressRing>
        </div>
        <div className="w-full">
          <Link
            to="/onboarding"
            aria-label={`View all ${counts.total} tasks`}
            className="focus-ring card-hover mb-2 flex items-center justify-between rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-3.5 py-2.5 text-white"
          >
            <span className="text-[12.5px] font-medium text-primary-100">Total onboarding tasks</span>
            <span className="text-[18px] font-bold leading-none tabular-nums">{counts.total}</span>
          </Link>
          <ul className="grid grid-cols-3 gap-2">
            {statuses.map((s) => (
              <li key={s.key}>
                <Link
                  to={`/onboarding?status=${s.key}`}
                  aria-label={`View ${s.value} ${s.label.toLowerCase()} tasks`}
                  className={`focus-ring card-hover flex flex-col items-center rounded-xl px-2 py-2.5 text-center ring-1 ${s.tile}`}
                >
                  <span className="text-[20px] font-bold leading-tight tabular-nums">{s.value}</span>
                  <span className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-slate-500">
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
                    {s.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
