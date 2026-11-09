import type { HrEmployeeRecord, HrOnboardingStatus, HrSummary } from "../../types/hr";
import { percentage } from "../../utils/format";
import { countForStatus, HR_STATUS_ORDER } from "../../utils/hr";
import { ProgressRing } from "../ui/ProgressRing";
import { hrStatusMeta } from "./HrStatusBadge";

const statusFill: Record<HrOnboardingStatus, string> = {
  at_risk: "bg-amber-400",
  not_started: "bg-slate-300",
  on_track: "bg-primary-500",
  completed: "bg-emerald-500",
};

interface HrOverviewPanelProps {
  summary: HrSummary;
  /** Every employee (unfiltered), for the department breakdown. */
  employees: HrEmployeeRecord[];
  activeStatus: HrOnboardingStatus | "all";
  onStatusSelect: (status: HrOnboardingStatus | "all") => void;
}

/** Organisation-level analytics from the API: task completion, status distribution and progress by department. */
export function HrOverviewPanel({ summary, employees, activeStatus, onStatusSelect }: HrOverviewPanelProps) {
  const completion = percentage(summary.completedTasks, summary.totalTasks);
  const distribution = HR_STATUS_ORDER.map((status) => ({ status, count: countForStatus(summary.statusCounts, status) }));

  const departments = summary.departments
    .map((department) => {
      const group = employees.filter((e) => e.department === department);
      return {
        department,
        people: group.length,
        progress: percentage(
          group.reduce((s, e) => s + e.completedTasks, 0),
          group.reduce((s, e) => s + e.totalTasks, 0),
        ),
      };
    })
    .filter((d) => d.people > 0)
    .sort((a, b) => b.progress - a.progress || a.department.localeCompare(b.department))
    .slice(0, 5);

  return (
    <section aria-label="Onboarding overview" className="grid overflow-hidden rounded-panel border border-line bg-white shadow-card lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)]">
      {/* Task completion */}
      <div className="relative flex items-center gap-5 overflow-hidden bg-gradient-to-br from-primary-600 to-primary-800 p-6 text-white">
        <span className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full border border-white/10" aria-hidden="true" />
        <span className="pointer-events-none absolute -bottom-8 -right-8 h-32 w-32 rounded-full border border-white/10" aria-hidden="true" />
        <ProgressRing value={completion} size={96} strokeWidth={8} track="dark" label="Checklist tasks completed across all employees">
          <span className="text-xl font-semibold tabular-nums">{completion}%</span>
        </ProgressRing>
        <div className="relative">
          <p className="eyebrow text-primary-200">Cohort completion</p>
          <p className="mt-1 text-xs text-white/50 tabular-nums">
            {summary.completedTasks} of {summary.totalTasks} tasks
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">
            Across {summary.totalEmployees} employees
          </p>
          <p className="mt-0.5 text-xs text-white/50 tabular-nums">
            Average {summary.averageCompletion}% per employee
          </p>
        </div>
      </div>

      {/* Status distribution */}
      <div className="border-t border-line p-6 lg:border-l lg:border-t-0">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13.5px] font-semibold text-primary-700">Status distribution</h2>
          <span className="text-xs text-slate-400">Select to filter</span>
        </div>
        <div
          className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={distribution.map((d) => `${hrStatusMeta[d.status].label}: ${d.count}`).join(", ")}
        >
          {distribution.map((d) =>
            d.count === 0 || summary.totalEmployees === 0 ? null : (
              <span
                key={d.status}
                className={`h-full origin-left animate-grow-x border-r-2 border-white last:border-r-0 ${statusFill[d.status]}`}
                style={{ width: `${(d.count / summary.totalEmployees) * 100}%` }}
              />
            ),
          )}
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-1.5">
          {distribution.map((d) => {
            const selected = activeStatus === d.status;
            return (
              <li key={d.status}>
                <button
                  type="button"
                  onClick={() => onStatusSelect(selected ? "all" : d.status)}
                  aria-pressed={selected}
                  className={`focus-ring flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${selected ? "bg-primary-50 ring-1 ring-primary-200" : "hover:bg-surface"}`}
                >
                  <span className={`h-2.5 w-2.5 rounded-sm ${statusFill[d.status]}`} aria-hidden="true" />
                  <span className="flex-1 text-slate-600">{hrStatusMeta[d.status].label}</span>
                  <span className="font-semibold text-navy-900 tabular-nums">{d.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Department progress */}
      <div className="border-t border-line p-6 lg:border-l lg:border-t-0">
        <h2 className="text-[13.5px] font-semibold text-primary-700">Progress by department</h2>
        {departments.length === 0 ? (
          <p className="mt-4 text-[13px] text-slate-500">No employees yet.</p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {departments.map((d) => (
              <li key={d.department} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_36px] items-center gap-3 text-[13px]">
                <span className="truncate text-slate-600" title={`${d.department} · ${d.people} ${d.people === 1 ? "person" : "people"}`}>
                  {d.department}
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <span className={`block h-full origin-left animate-grow-x rounded-full ${d.progress === 100 ? "bg-emerald-500" : "bg-primary-500"}`} style={{ width: `${d.progress}%` }} />
                </span>
                <span className="text-right text-xs font-semibold text-navy-900 tabular-nums">{d.progress}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
