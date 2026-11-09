import type { OnboardingTask } from "../../types/dashboard";
import { percentage } from "../../utils/format";
import { getTaskCounts } from "../../utils/onboarding";
import { ProgressBar } from "../ui/ProgressBar";
import { ProgressRing } from "../ui/ProgressRing";

/**
 * Progress summary for All Tasks: overall completion and the number of tasks in each status. It always counts every
 * task, so it doesn't change with the checklist's filters or grouping.
 */
export function ProgressSummary({ tasks }: { tasks: OnboardingTask[] }) {
  const counts = getTaskCounts(tasks);
  const overall = percentage(counts.completed, counts.total);
  const rows = [
    { label: "Pending", value: counts.pending, dot: "bg-slate-400", tone: "slate" as const },
    { label: "In Progress", value: counts.inProgress, dot: "bg-primary-500", tone: "blue" as const },
    { label: "Completed", value: counts.completed, dot: "bg-emerald-500", tone: "green" as const },
  ];

  return (
    <section aria-labelledby="progress-summary-heading" className="rounded-panel border border-primary-100 bg-white p-5 shadow-card">
      <h2 id="progress-summary-heading" className="text-[15px] font-semibold tracking-tight text-primary-700">
        Progress summary
      </h2>
      <div className="mt-4 flex items-center gap-4">
        <ProgressRing value={overall} size={84} strokeWidth={9} label="Overall completion">
          <span className="text-[19px] font-bold leading-none text-primary-700 tabular-nums">{overall}%</span>
        </ProgressRing>
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-slate-500">Total tasks</p>
          <p className="text-[26px] font-bold leading-tight text-navy-900 tabular-nums" data-testid="summary-total">
            {counts.total}
          </p>
          <p className="text-[12px] text-slate-500">{overall}% complete{counts.overdue ? ` · ${counts.overdue} overdue` : ""}</p>
        </div>
      </div>
      <dl className="mt-5 space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between text-[12.5px]">
              <dt className="inline-flex items-center gap-1.5 text-slate-600">
                <span className={`h-1.5 w-1.5 rounded-full ${row.dot}`} aria-hidden="true" />
                {row.label}
              </dt>
              <dd className="font-semibold text-navy-900 tabular-nums">{row.value}</dd>
            </div>
            <ProgressBar value={percentage(row.value, counts.total)} size="xs" tone={row.tone} label={`${row.label}: ${row.value} of ${counts.total} tasks`} />
          </div>
        ))}
      </dl>
    </section>
  );
}
