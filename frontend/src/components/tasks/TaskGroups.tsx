import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Lock, Timer } from "lucide-react";
import { taskCategoryIcons } from "../../config/taskMeta";
import { useOnboarding } from "../../context/OnboardingContext";
import type { OnboardingTask, TaskPriority, TaskStatus } from "../../types/dashboard";
import { formatDuration } from "../../utils/format";
import { describeDue, getBlockingTasks, type PriorityGroup } from "../../utils/onboarding";
import { StatusPill, type StatusTone } from "../ui/StatusPill";
import { TaskCheckbox } from "./TaskCheckbox";

export const priorityGroupMeta: Record<TaskPriority, { label: string; dot: string; text: string; band: string; accent: string }> = {
  high: { label: "High Priority", dot: "bg-rose-500", text: "text-rose-700", band: "bg-rose-50/60", accent: "border-l-rose-400" },
  medium: { label: "Medium Priority", dot: "bg-amber-500", text: "text-amber-800", band: "bg-amber-50/60", accent: "border-l-amber-400" },
  low: { label: "Low Priority", dot: "bg-slate-400", text: "text-slate-600", band: "bg-slate-50", accent: "border-l-slate-300" },
};

/** The status shown beside a task name; the same pill style as Help Desk ticket statuses. */
export const taskStatusIndicator: Record<TaskStatus, { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "neutral" },
  in_progress: { label: "In Progress", tone: "blue" },
  completed: { label: "Completed", tone: "green" },
};

function StatusIndicator({ status }: { status: TaskStatus }) {
  const meta = taskStatusIndicator[status];
  return (
    <StatusPill tone={meta.tone} size="sm" testId="task-status">
      {meta.label}
    </StatusPill>
  );
}

/** Remembers which groups are collapsed (by key). `initiallyCollapsed` keys start closed. */
export function useCollapsedGroups(initiallyCollapsed: string[] = []) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(initiallyCollapsed));
  return {
    isOpen: (key: string) => !collapsed.has(key),
    toggle: (key: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
  };
}

interface ChecklistRowProps {
  task: OnboardingTask;
  onOpen: (task: OnboardingTask) => void;
  selected?: boolean;
  /** Show the journey stage beside the category. */
  showStage?: boolean;
  /** Show a small status indicator beside the task name (used when the list mixes statuses). */
  showStatus?: boolean;
  /** Optional control on the right (e.g. Start / Continue). Defaults to an "open" chevron. */
  trailing?: ReactNode;
}

/**
 * A lightweight task row: name (with an optional status indicator), category (and stage), due date, and a dependency
 * note only when the task is locked. Priority is not repeated here: it's shown once by the group heading above.
 */
export function ChecklistRow({ task, onOpen, selected = false, showStage = true, showStatus = false, trailing }: ChecklistRowProps) {
  const { tasks } = useOnboarding();
  const completed = task.status === "completed";
  const blocking = completed ? [] : getBlockingTasks(task, tasks);
  const due = describeDue(task);
  const duration = completed && task.timeSpentSeconds != null && task.firstStartedAt ? formatDuration(task.timeSpentSeconds) : null;
  const CategoryIcon = taskCategoryIcons[task.category];
  // With a status indicator the row already says "Completed"; only the time taken is worth adding.
  const completedNote = duration ? (showStatus ? `Took ${duration}` : `Completed in ${duration}`) : showStatus ? null : "Done";

  return (
    <li
      className={`group relative flex items-center gap-3 px-4 py-3 transition-colors duration-150 focus-within:bg-primary-50/60 sm:px-5 ${
        selected ? "bg-primary-50 shadow-[inset_3px_0_0_var(--color-primary-500)]" : "hover:bg-primary-50/50"
      }`}
    >
      <TaskCheckbox task={task} onOpen={onOpen} />
      <button type="button" onClick={() => onOpen(task)} className="focus-ring min-w-0 flex-1 rounded text-left">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`truncate text-[13.5px] font-semibold ${completed ? "text-slate-400 line-through decoration-slate-300" : "text-primary-700 group-hover:text-primary-800"}`}>
            {task.title}
          </span>
          {showStatus && <StatusIndicator status={task.status} />}
        </span>
        <span className={`mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] ${completed && showStatus ? "text-slate-400" : "text-slate-500"}`}>
          <span className="inline-flex items-center gap-1">
            <CategoryIcon size={12} className="text-primary-300" aria-hidden="true" />
            {task.category}
          </span>
          {showStage && (
            <>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span>{task.stage}</span>
            </>
          )}
          {completed ? (
            completedNote && (
              <>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  {duration ? <Timer size={11} aria-hidden="true" /> : null}
                  {completedNote}
                </span>
              </>
            )
          ) : (
            <>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className={due.tone === "overdue" ? "font-semibold text-rose-600" : due.tone === "soon" ? "font-medium text-amber-700" : ""}>{due.label}</span>
            </>
          )}
          {blocking.length > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-amber-700">
              <Lock size={11} aria-hidden="true" />
              After {blocking.map((t) => t.title).join(", ")}
            </span>
          )}
        </span>
      </button>
      {trailing ?? (
        // The task title is the real button; this is a visual cue of the row's action.
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-[12px] font-semibold text-primary-400 transition-colors group-focus-within:text-primary-600 group-hover:bg-white group-hover:text-primary-600"
          aria-hidden="true"
        >
          <span className="hidden sm:inline">{completed ? "View" : "Open"}</span>
          <ChevronRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      )}
    </li>
  );
}

interface GroupHeaderProps {
  open: boolean;
  onToggle: () => void;
  controls: string;
  children: ReactNode;
  className?: string;
}

function GroupHeader({ open, onToggle, controls, children, className = "" }: GroupHeaderProps) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls} className={`focus-ring flex w-full items-center gap-2.5 text-left transition-colors ${className}`}>
      {children}
      <ChevronDown size={15} className={`ml-auto shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
  );
}

interface PriorityGroupsProps {
  groups: PriorityGroup[];
  onOpen: (task: OnboardingTask) => void;
  /** Prefix for group keys and element IDs, so groups in different lists stay unique. Also appended to the label. */
  scope: string;
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
  selectedTaskId?: string;
  showStage?: boolean;
  /** Show each task's status beside its name, and how many tasks in the group are done. */
  showStatus?: boolean;
  /** Heading level of the priority headings (3 when they are the top-level groups of a section). */
  headingLevel?: 3 | 4;
  trailing?: (task: OnboardingTask) => ReactNode;
}

/** Priority headings (shown once each), with their tasks underneath. Each group collapses independently. */
export function PriorityGroups({ groups, onOpen, scope, isOpen, toggle, selectedTaskId, showStage, showStatus = false, headingLevel = 4, trailing }: PriorityGroupsProps) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  return (
    <>
      {groups.map(({ priority, tasks }) => {
        const key = `${scope}:${priority}`;
        const meta = priorityGroupMeta[priority];
        const open = isOpen(key);
        const listId = `group-${key.replace(/\W+/g, "-")}`;
        const done = tasks.filter((t) => t.status === "completed").length;
        return (
          <section key={priority} aria-label={`${meta.label}${scope ? ` · ${scope}` : ""}`}>
            <Heading>
              <GroupHeader
                open={open}
                onToggle={() => toggle(key)}
                controls={listId}
                className={`border-l-[3px] ${meta.accent} ${headingLevel === 3 ? "px-4 py-2.5 sm:px-5" : "px-4 py-2 sm:px-5"} ${meta.band} hover:brightness-[0.98]`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
                <span className={`text-[12px] font-bold uppercase tracking-wide ${meta.text}`}>{meta.label}</span>
                <span className="rounded-full bg-white/80 px-1.5 text-[11px] font-semibold tabular-nums text-slate-500 ring-1 ring-inset ring-black/5">{tasks.length}</span>
                {showStatus && done > 0 && <span className="ml-1 text-[11px] font-medium text-slate-400">· {done} done</span>}
              </GroupHeader>
            </Heading>
            {open && (
              <ul id={listId} className="animate-fade-in divide-y divide-line/70">
                {tasks.map((task) => (
                  <ChecklistRow key={task.id} task={task} onOpen={onOpen} selected={task.id === selectedTaskId} showStage={showStage} showStatus={showStatus} trailing={trailing?.(task)} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

interface PriorityChecklistProps {
  groups: PriorityGroup[];
  onOpen: (task: OnboardingTask) => void;
  selectedTaskId?: string;
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
}

/**
 * The full checklist: High, Medium and Low Priority headings, each shown once and collapsible, with every task of that
 * priority underneath whatever its status. Each row carries a small status indicator instead.
 */
export function PriorityChecklist({ groups, onOpen, selectedTaskId, isOpen, toggle }: PriorityChecklistProps) {
  return (
    <div className="divide-y divide-line">
      <PriorityGroups groups={groups} onOpen={onOpen} scope="" isOpen={isOpen} toggle={toggle} selectedTaskId={selectedTaskId} showStatus headingLevel={3} />
    </div>
  );
}
