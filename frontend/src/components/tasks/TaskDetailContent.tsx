import type { ReactNode } from "react";
import { STAGE_ORDER } from "../../config/stages";
import { taskCategoryIcons, taskPriorityMeta, taskStatusMeta } from "../../config/taskMeta";
import type { OnboardingTask, TaskPriority, TaskStatus } from "../../types/dashboard";
import { useOnboarding } from "../../context/OnboardingContext";
import { formatDuration, formatLongDate } from "../../utils/format";
import { describeDue } from "../../utils/onboarding";
import { TaskStatusControl } from "./TaskStatusControl";
import { TaskActionPanel } from "./actions/TaskActionPanel";

const statusDot: Record<TaskStatus, string> = { pending: "bg-slate-400", in_progress: "bg-primary-500", completed: "bg-emerald-500" };
const priorityText: Record<TaskPriority, string> = { high: "text-rose-600", medium: "text-amber-700", low: "text-slate-500" };

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium text-navy-900">{children}</dd>
    </div>
  );
}

/**
 * Task details shared by the side panel (wide screens) and the modal (narrow screens). Kept light: a blue title, one
 * quiet line for status, priority and due date, the task's actual action, and a few essential facts.
 */
export function TaskDetailContent({ task }: { task: OnboardingTask }) {
  const due = describeDue(task);
  const { tasks } = useOnboarding();
  const prerequisites = (task.dependsOn ?? []).map((id) => tasks.find((t) => t.id === id)).filter((t): t is OnboardingTask => Boolean(t));
  const timeSpent = task.timeSpentSeconds != null && task.firstStartedAt ? formatDuration(task.timeSpentSeconds) : null;
  const CategoryIcon = taskCategoryIcons[task.category];
  const completed = task.status === "completed";

  return (
    <div>
      <h3 className="text-[17px] font-semibold leading-snug tracking-tight text-primary-700">{task.title}</h3>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-slate-500">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
          <span className={`h-2 w-2 rounded-full ${statusDot[task.status]}`} aria-hidden="true" />
          {taskStatusMeta[task.status].label}
        </span>
        {!completed && (
          <>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className={`font-medium ${priorityText[task.priority]}`}>{taskPriorityMeta[task.priority].label} priority</span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className={due.tone === "overdue" ? "font-semibold text-rose-600" : due.tone === "soon" ? "font-medium text-amber-700" : ""}>{due.label}</span>
          </>
        )}
      </p>

      <p className="mt-3 text-[13.5px] leading-relaxed text-slate-600">{task.description}</p>

      <div className="mt-4">{task.actionType ? <TaskActionPanel task={task} /> : <TaskStatusControl task={task} />}</div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-primary-100 pt-4">
        <Detail label="Stage">
          {task.stage} <span className="font-normal text-slate-400">({STAGE_ORDER.indexOf(task.stage) + 1} of {STAGE_ORDER.length})</span>
        </Detail>
        <Detail label="Category">
          <span className="inline-flex items-center gap-1.5">
            <CategoryIcon size={13} className="text-primary-400" aria-hidden="true" />
            {task.category}
          </span>
        </Detail>
        <Detail label="Due date">{formatLongDate(task.dueDate)}</Detail>
        {timeSpent && <Detail label={completed ? "Time taken" : "Time spent so far"}>{completed ? `Completed in ${timeSpent}` : timeSpent}</Detail>}
        {prerequisites.length > 0 && (
          <div className="col-span-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Do this first</dt>
            <dd className="mt-0.5 flex flex-col gap-0.5 text-[13px] font-medium">
              {prerequisites.map((p) => (
                <span key={p.id} className={p.status === "completed" ? "text-emerald-700" : "text-amber-700"}>
                  {p.status === "completed" ? "✓ " : ""}
                  {p.title}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>

      <p className="mt-4 text-[11px] text-slate-400">Your submissions and status changes are saved to your onboarding record on the OnboardIQ server.</p>
    </div>
  );
}
