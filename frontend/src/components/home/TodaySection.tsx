import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarCheck, CalendarOff, ChevronDown, Lock, Play } from "lucide-react";
import { DEMO_TODAY } from "../../config/demo";
import { useTaskActions } from "../../hooks/useTaskActions";
import type { OnboardingCalendar } from "../../types/calendar";
import type { OnboardingTask } from "../../types/dashboard";
import { formatLongDate, pluralize } from "../../utils/format";
import { getTodayOverview, isBlocked } from "../../utils/onboarding";
import { SectionIllustration } from "../illustrations/SectionIllustration";
import { ChecklistRow, PriorityGroups, useCollapsedGroups } from "../tasks/TaskGroups";
import { ProgressBar } from "../ui/ProgressBar";
import { SectionHeader } from "../ui/SectionHeader";

interface TodaySectionProps {
  tasks: OnboardingTask[];
  calendar: OnboardingCalendar | null;
  onOpen: (task: OnboardingTask) => void;
  /** Start (if needed) and open a task. */
  onStart: (task: OnboardingTask) => void;
}

/**
 * Only today's work: open tasks due today (plus overdue ones, which still need doing), grouped by priority with each
 * heading shown once; tasks finished today in a collapsed list; and, when nothing is due, why and when work resumes.
 */
export function TodaySection({ tasks, calendar, onOpen, onStart }: TodaySectionProps) {
  const today = calendar?.today ?? DEMO_TODAY;
  const { active, activeCount, completed } = getTodayOverview(tasks, today);
  const groups = useCollapsedGroups();
  const { isSaving } = useTaskActions();
  const [showCompleted, setShowCompleted] = useState(false);
  const total = activeCount + completed.length;
  const hasOverdue = active.some((g) => g.tasks.some((t) => t.dueDate < today));
  const todayInfo = calendar?.days.find((d) => d.date === today);
  const nextActivity = calendar?.days.find((d) => d.date > today && d.taskIds.some((id) => tasks.find((t) => t.id === id)?.status !== "completed"));
  const isDayOff = todayInfo && todayInfo.dayType !== "working";

  const startButton = (task: OnboardingTask) => {
    if (isBlocked(task, tasks)) {
      return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-400" title="Complete its prerequisite first">
          <Lock size={12} aria-hidden="true" />
          Locked
        </span>
      );
    }
    const continuing = task.status === "in_progress";
    return (
      <button
        type="button"
        onClick={() => onStart(task)}
        disabled={isSaving(task)}
        aria-label={`${continuing ? "Continue" : "Start"} “${task.title}”`}
        className={`focus-ring inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
          continuing ? "bg-primary-50 text-primary-700 ring-1 ring-primary-200 hover:bg-primary-100" : "bg-primary-600 text-white shadow-sm hover:bg-primary-700"
        }`}
      >
        {continuing ? <ArrowRight size={12} aria-hidden="true" /> : <Play size={12} aria-hidden="true" />}
        {continuing ? "Continue" : "Start Task"}
      </button>
    );
  };

  return (
    <section aria-labelledby="today-heading" className="flex flex-col overflow-hidden rounded-panel border border-line bg-white shadow-card">
      <div className="p-5 sm:p-6">
        <SectionHeader
          id="today-heading"
          title="Today's Tasks"
          description={total ? `${completed.length} of ${pluralize(total, "task")} done today${hasOverdue ? " · includes overdue tasks" : ""}` : formatLongDate(today)}
          action={
            <Link to="/onboarding" className="focus-ring inline-flex items-center gap-1 rounded text-[12.5px] font-semibold text-primary-600 hover:text-primary-700 hover:underline">
              All tasks
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          }
        />
        {total > 0 && (
          <div className="mt-3">
            <ProgressBar value={Math.round((completed.length / total) * 100)} size="sm" tone="green" label="Today's progress" />
          </div>
        )}
      </div>

      {activeCount > 0 ? (
        <div className="border-t border-line">
          <PriorityGroups groups={active} onOpen={onOpen} scope="today" isOpen={groups.isOpen} toggle={groups.toggle} trailing={startButton} />
        </div>
      ) : (
        <div className="mx-5 mb-5 flex flex-1 flex-col items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary-50 to-white px-5 py-5 text-center text-[13px] leading-relaxed text-slate-600 ring-1 ring-primary-100 sm:mx-6" role="status">
          <SectionIllustration name={isDayOff ? "rest" : "ready"} className="h-28 w-36" />
          <p className="flex max-w-sm gap-2 text-left">
            {isDayOff ? <CalendarOff size={17} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" /> : <CalendarCheck size={17} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />}
            <span>
              {isDayOff && todayInfo?.reason
                ? todayInfo.reason
                : completed.length > 0
                  ? `Great job! You've completed all your tasks for today.${nextActivity ? ` Your next onboarding activity is on ${formatLongDate(nextActivity.date)}.` : ""}`
                  : (todayInfo?.reason ?? "No tasks are scheduled for today.")}
            </span>
          </p>
        </div>
      )}

      {completed.length > 0 && (
        <div className="mt-auto border-t border-line">
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            aria-expanded={showCompleted}
            aria-controls="completed-today"
            className="focus-ring flex w-full items-center gap-2 px-4 py-2.5 text-left text-[12.5px] font-semibold text-emerald-700 hover:bg-emerald-50/60 sm:px-5"
          >
            Completed today
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums">{completed.length}</span>
            <ChevronDown size={15} className={`ml-auto text-slate-400 transition-transform duration-200 ${showCompleted ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {showCompleted && (
            <ul id="completed-today" className="animate-fade-in divide-y divide-line/70 border-t border-line/70">
              {completed.map((task) => (
                <ChecklistRow key={task.id} task={task} onOpen={onOpen} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
