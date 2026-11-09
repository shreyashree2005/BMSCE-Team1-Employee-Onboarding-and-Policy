import { forwardRef, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, CircleDashed, Copy, Mail, UserRound } from "lucide-react";
import { STAGE_ORDER } from "../../config/stages";
import { useToast } from "../../context/ToastContext";
import type { OnboardingTask } from "../../types/dashboard";
import type { HrEmployeeDetail, HrEmployeeRecord } from "../../types/hr";
import { formatRelativeTimestamp } from "../../utils/activity";
import { formatLongDate, getInitials } from "../../utils/format";
import { describeDue } from "../../utils/onboarding";
import { StageSegments } from "../journey/StageSegments";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ProgressRing } from "../ui/ProgressRing";
import { Skeleton } from "../ui/Skeleton";
import { HrStatusBadge } from "./HrStatusBadge";

interface EmployeeDetailPanelProps {
  record: HrEmployeeRecord | undefined;
  detail: HrEmployeeDetail | null;
  detailState: "loading" | "ready" | "error";
  onRetryDetail: () => void;
}

function TaskStatusIcon({ task }: { task: OnboardingTask }) {
  if (task.status === "completed") return <CheckCircle2 size={15} className="shrink-0 text-emerald-500" aria-label="Completed" />;
  if (task.status === "in_progress") return <CircleDashed size={15} className="shrink-0 text-primary-500" aria-label="In progress" />;
  return <Circle size={15} className="shrink-0 text-slate-300" aria-label="Pending" />;
}

const OPEN_PREVIEW = 5;

function TaskList({ tasks }: { tasks: OnboardingTask[] }) {
  const [showAll, setShowAll] = useState(false);
  const open = tasks.filter((t) => t.status !== "completed");
  const done = tasks.filter((t) => t.status === "completed");
  // Next five open tasks by default (already sorted by stage and due date); everything on request.
  const visible = showAll ? [...open, ...done] : open.slice(0, OPEN_PREVIEW);
  const hidden = tasks.length - visible.length;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-[13px]">
        <span className="font-semibold text-navy-900">Checklist</span>
        <span className="text-xs text-slate-500">{open.length} open</span>
      </div>
      {visible.length === 0 ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-700">Every task is complete.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {visible.map((task) => {
            const due = describeDue(task);
            return (
              <li key={task.id} className="flex items-start gap-2.5 px-3 py-2.5">
                <span className="mt-0.5">
                  <TaskStatusIcon task={task} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] leading-snug ${task.status === "completed" ? "text-slate-500" : "text-navy-900"}`}>{task.title}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {task.stage} · {task.category}
                  </span>
                </span>
                <span
                  className={`shrink-0 whitespace-nowrap text-[11px] font-semibold ${
                    due.tone === "overdue" ? "text-rose-600" : due.tone === "soon" ? "text-amber-700" : "text-slate-400"
                  }`}
                >
                  {due.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {(hidden > 0 || showAll) && (
        <button
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
          aria-expanded={showAll}
          className="focus-ring mt-2 inline-flex items-center gap-1 rounded text-xs font-semibold text-primary-600 hover:text-primary-700"
        >
          <ChevronDown size={14} className={`transition-transform ${showAll ? "rotate-180" : ""}`} aria-hidden="true" />
          {showAll ? "Show fewer" : `Show all ${tasks.length} tasks (${done.length} completed)`}
        </button>
      )}
    </div>
  );
}

/** Profile, progress and task statuses of the selected employee (from GET /api/v1/hr/employees/{id}). */
export const EmployeeDetailPanel = forwardRef<HTMLElement, EmployeeDetailPanelProps>(function EmployeeDetailPanel({ record, detail, detailState, onRetryDetail }, ref) {
  const { showToast } = useToast();

  if (!record) {
    return (
      <section ref={ref} className="rounded-panel border border-line bg-white shadow-card">
        <EmptyState icon={UserRound} title="No employee selected" message="Select an employee in the table to see their onboarding." />
      </section>
    );
  }

  const stage = record.currentStage ?? "Completed";
  const stageIndex = record.currentStage ? STAGE_ORDER.indexOf(record.currentStage) + 1 : STAGE_ORDER.length;

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(record.email);
      showToast(`Copied ${record.firstName}'s email address.`);
    } catch {
      showToast(`Copy failed. The email address is ${record.email}`, "info");
    }
  };

  const details = [
    { label: "Department", value: record.department },
    { label: "Location", value: record.location },
    { label: "Manager", value: record.managerName ?? "Not assigned" },
    { label: "Buddy", value: detail?.buddyName ?? (detailState === "loading" ? "…" : "Not assigned") },
    { label: "Start date", value: formatLongDate(record.startDate) },
    { label: "Last activity", value: record.lastActivityAt ? formatRelativeTimestamp(record.lastActivityAt) : "No activity yet" },
  ];

  const taskStats = [
    { label: "Completed", value: record.completedTasks, className: "text-emerald-600" },
    { label: "Open", value: record.totalTasks - record.completedTasks, className: "text-navy-900" },
    { label: "Overdue", value: record.overdueTasks, className: record.overdueTasks > 0 ? "text-rose-600" : "text-navy-900" },
  ];

  return (
    <section ref={ref} aria-label={`Onboarding details for ${record.fullName}`} className="scroll-mt-24 overflow-hidden rounded-panel border border-line bg-white shadow-card">
      <div key={record.id} className="animate-fade-in">
        <div className="relative border-b border-line bg-gradient-to-b from-primary-50/70 to-white px-6 pb-5 pt-6">
          <div className="flex items-start gap-4">
            <Avatar initials={getInitials(record.firstName, record.lastName)} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold tracking-tight text-navy-900">{record.fullName}</p>
              <p className="text-[13px] text-slate-500">
                {record.jobTitle}
                {record.jobRoleLabel && record.jobRoleLabel !== record.jobTitle && <span className="text-slate-400"> · {record.jobRoleLabel} track</span>}
              </p>
              <div className="mt-2">
                <HrStatusBadge status={record.status} />
              </div>
            </div>
            <ProgressRing value={record.completionPercentage} size={56} strokeWidth={6} label="Onboarding progress">
              <span className="text-[13px] font-semibold text-navy-900 tabular-nums">{record.completionPercentage}%</span>
            </ProgressRing>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <div className="mb-2 flex items-baseline justify-between text-[13px]">
              <span className="font-semibold text-navy-900">Journey</span>
              <span className="text-xs text-slate-500">
                {record.currentStage ? `Stage ${stageIndex} of ${STAGE_ORDER.length} · ${record.currentStage}` : "All stages complete"}
              </span>
            </div>
            <StageSegments currentStage={stage} size="md" />
          </div>

          <dl className="grid grid-cols-3 divide-x divide-line rounded-lg border border-line text-center">
            {taskStats.map((stat) => (
              <div key={stat.label} className="flex flex-col-reverse py-3">
                <dt className="text-[11px] text-slate-500">{stat.label} tasks</dt>
                <dd className={`text-lg font-semibold tabular-nums ${stat.className}`}>{stat.value}</dd>
              </div>
            ))}
          </dl>

          {detailState === "loading" && (
            <div className="space-y-2" aria-label="Loading checklist">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}
          {detailState === "error" && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700">
              Couldn't load the checklist.
              <Button variant="secondary" size="sm" onClick={onRetryDetail}>
                Retry
              </Button>
            </div>
          )}
          {detailState === "ready" && detail && <TaskList tasks={detail.tasks} />}

          <dl className="divide-y divide-line text-[13px]">
            {details.map((item) => (
              <div key={item.label} className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate-500">{item.label}</dt>
                <dd className="text-right font-medium text-navy-900">{item.value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={copyEmail}>
              <Copy size={14} aria-hidden="true" />
              Copy email
            </Button>
            <a
              href={`mailto:${record.email}`}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-white px-3 text-xs font-semibold text-navy-900 hover:bg-surface"
            >
              <Mail size={14} aria-hidden="true" />
              Email
            </a>
          </div>
        </div>
      </div>
    </section>
  );
});
