import { useState } from "react";
import { ArrowRight, CalendarCheck, CalendarClock, CalendarDays, CalendarOff, CircleCheck, Info, PartyPopper, type LucideIcon } from "lucide-react";
import { taskPriorityMeta } from "../../config/taskMeta";
import type { CalendarDay, OnboardingCalendar as CalendarData } from "../../types/calendar";
import type { OnboardingTask, TaskPriority } from "../../types/dashboard";
import { formatLongDate } from "../../utils/format";
import { SectionHeader } from "../ui/SectionHeader";
import { Skeleton } from "../ui/Skeleton";

const dotColors: Record<TaskPriority, string> = { high: "bg-rose-500", medium: "bg-amber-500", low: "bg-slate-400" };

export function dayLabel(day: CalendarDay): string {
  if (day.dayType === "weekly_off") return "Weekly off";
  if (day.dayType === "company_holiday") return day.holidayName ?? "Company holiday";
  if (day.dayType === "festival_holiday") return day.holidayName ?? "Festival holiday";
  return "";
}

/** What a day looks like: open tasks, all done, a holiday, a weekly day off, or an empty working day. */
type DayKind = "tasks" | "done" | "holiday" | "off" | "empty";

function kindOf(day: CalendarDay, due: OnboardingTask[]): DayKind {
  if (due.some((t) => t.status !== "completed")) return "tasks";
  if (due.length > 0) return "done";
  if (day.dayType === "weekly_off") return "off";
  if (day.dayType !== "working") return "holiday";
  return "empty";
}

const kindStyle: Record<DayKind, { tile: string; icon: LucideIcon; iconTile: string; chip: string; chipText: string }> = {
  tasks: {
    tile: "bg-primary-50 text-primary-800 ring-1 ring-inset ring-primary-200 hover:ring-primary-400",
    icon: CalendarClock,
    iconTile: "bg-primary-500 text-white",
    chip: "bg-primary-50 text-primary-700 ring-primary-100",
    chipText: "Tasks due",
  },
  done: {
    tile: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200 hover:ring-emerald-400",
    icon: CircleCheck,
    iconTile: "bg-emerald-500 text-white",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    chipText: "All done",
  },
  holiday: {
    tile: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 hover:ring-amber-400",
    icon: PartyPopper,
    iconTile: "bg-amber-400 text-navy-950",
    chip: "bg-amber-50 text-amber-800 ring-amber-200",
    chipText: "Holiday",
  },
  off: {
    tile: "bg-[repeating-linear-gradient(135deg,#f8fafc_0_6px,#eef2f7_6px_12px)] text-slate-400 ring-1 ring-inset ring-slate-200 hover:ring-slate-300",
    icon: CalendarOff,
    iconTile: "bg-slate-200 text-slate-600",
    chip: "bg-slate-50 text-slate-600 ring-slate-200",
    chipText: "Weekly off",
  },
  empty: {
    tile: "bg-white text-slate-600 ring-1 ring-inset ring-line hover:ring-primary-300",
    icon: CalendarCheck,
    iconTile: "bg-primary-50 text-primary-600",
    chip: "bg-white text-slate-600 ring-line",
    chipText: "Working day",
  },
};

const FALLBACK_TITLE: Record<DayKind, string> = {
  tasks: "Tasks scheduled",
  done: "All tasks completed",
  holiday: "Holiday",
  off: "Weekly Holiday",
  empty: "No tasks scheduled",
};

const legend: { kind: DayKind; label: string }[] = [
  { kind: "tasks", label: "Tasks due" },
  { kind: "done", label: "All done" },
  { kind: "holiday", label: "Holiday" },
  { kind: "off", label: "Weekly off" },
];

interface OnboardingCalendarProps {
  calendar: CalendarData | null;
  error: string | null;
  tasks: OnboardingTask[];
  onOpen: (task: OnboardingTask) => void;
}

/**
 * The next 15 days. Every day can be selected: days with tasks list them (select one to open it); days without
 * tasks explain why, using only the configured schedule and holiday calendar (a weekly day off, a company or
 * festival holiday, all tasks done, or simply nothing scheduled), and where onboarding continues.
 */
export function OnboardingCalendar({ calendar, error, tasks, onOpen }: OnboardingCalendarProps) {
  const [selected, setSelected] = useState<string | null>(null);

  if (error) {
    return (
      <section aria-labelledby="calendar-heading" className="rounded-panel border border-line bg-white p-5 shadow-card sm:p-6">
        <SectionHeader id="calendar-heading" title="Your 15-day calendar" description={error} />
      </section>
    );
  }
  if (!calendar) {
    return (
      <section aria-label="Loading calendar" className="rounded-panel border border-line bg-white p-5 shadow-card sm:p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-4 h-16 w-full" />
      </section>
    );
  }

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const dueOn = (day: CalendarDay) => day.taskIds.map((id) => byId.get(id)).filter((t): t is OnboardingTask => Boolean(t));
  const active = calendar.days.find((d) => d.date === (selected ?? calendar.today)) ?? calendar.days[0];
  const activeTasks = dueOn(active);
  const activeKind = kindOf(active, activeTasks);
  const style = kindStyle[activeKind];
  const ActiveIcon = style.icon;
  const nextInRange = active.nextActivityDate && calendar.days.some((d) => d.date === active.nextActivityDate) ? active.nextActivityDate : null;
  const offDays = calendar.weeklyOffDays.length ? calendar.weeklyOffDays.join(" and ") : "none";

  return (
    <section aria-labelledby="calendar-heading" className="rounded-panel border border-line bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          id="calendar-heading"
          title="Your 15-day calendar"
          description={`Select any day to see its tasks, or why nothing is scheduled. Weekly days off: ${offDays}.`}
          leading={
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-glow">
              <CalendarDays size={19} aria-hidden="true" />
            </span>
          }
        />
        <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11.5px] font-medium text-slate-500" aria-label="Calendar legend">
          {legend.map(({ kind, label }) => (
            <li key={kind} className="inline-flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded ${kindStyle[kind].tile.split(" hover:")[0]}`} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <ol className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-[repeat(15,minmax(0,1fr))]" aria-label="Next 15 days">
        {calendar.days.map((day) => {
          const date = new Date(`${day.date}T00:00:00`);
          const isToday = day.date === calendar.today;
          const isSelected = day.date === active.date;
          const off = day.dayType !== "working";
          const due = dueOn(day);
          const kind = kindOf(day, due);
          const open = due.filter((t) => t.status !== "completed");
          const label = `${formatLongDate(day.date)}${off ? `, ${dayLabel(day)}` : ""}: ${due.length ? `${due.length} task${due.length === 1 ? "" : "s"}` : "no tasks"}`;
          return (
            <li key={day.date}>
              <button
                type="button"
                onClick={() => setSelected(day.date)}
                aria-pressed={isSelected}
                aria-label={label}
                title={label}
                className={`focus-ring relative flex h-[76px] w-full flex-col items-center justify-between rounded-xl py-2 text-center transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 ${
                  isSelected ? "bg-gradient-to-b from-primary-500 to-primary-700 text-white shadow-glow" : kindStyle[kind].tile
                } ${isToday && !isSelected ? "outline outline-2 outline-offset-2 outline-primary-500" : ""}`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-wide ${isSelected ? "text-primary-100" : isToday ? "text-primary-600" : ""}`}>
                  {isToday ? "Today" : date.toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span className="text-[17px] font-bold leading-none tabular-nums">{date.getDate()}</span>
                <span className="flex h-3 items-center gap-0.5" aria-hidden="true">
                  {kind === "tasks" ? (
                    open.slice(0, 4).map((t) => <span key={t.id} className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : dotColors[t.priority]}`} />)
                  ) : kind === "done" ? (
                    <CircleCheck size={12} className={isSelected ? "text-white" : "text-emerald-600"} />
                  ) : kind === "holiday" ? (
                    <PartyPopper size={11} className={isSelected ? "text-white" : "text-amber-600"} />
                  ) : null}
                </span>
                {kind === "tasks" && (
                  <span
                    className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9.5px] font-bold tabular-nums ${
                      isSelected ? "bg-amber-400 text-navy-950 ring-2 ring-white" : "bg-primary-600 text-white ring-2 ring-white"
                    }`}
                    aria-hidden="true"
                  >
                    {open.length}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <div key={active.date} className="mt-5 animate-fade-in overflow-hidden rounded-xl border border-primary-100 bg-gradient-to-br from-primary-50/70 via-white to-white" aria-live="polite" data-testid="calendar-day-details">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.iconTile}`} aria-hidden="true">
            <ActiveIcon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold text-primary-800">{active.title || FALLBACK_TITLE[activeKind]}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${style.chip}`}>{style.chipText}</span>
              {active.date === calendar.today && <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[11px] font-semibold text-white">Today</span>}
            </div>
            <p className="mt-0.5 text-[12.5px] font-medium text-slate-500">{formatLongDate(active.date)}</p>

            {activeTasks.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {activeTasks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(t)}
                      className="focus-ring group flex w-full items-center gap-3 rounded-lg bg-white px-3 py-2 text-left text-[13px] ring-1 ring-line transition-[box-shadow,ring-color] hover:shadow-card hover:ring-primary-300"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${t.status === "completed" ? "bg-emerald-500" : dotColors[t.priority]}`} aria-hidden="true" />
                      <span className={`min-w-0 flex-1 truncate font-medium ${t.status === "completed" ? "text-slate-400 line-through" : "text-navy-900"}`}>{t.title}</span>
                      {t.status === "completed" ? (
                        <span className="text-xs font-semibold text-emerald-700">Done</span>
                      ) : (
                        <span className="hidden text-xs text-slate-500 sm:inline">{taskPriorityMeta[t.priority].label} priority</span>
                      )}
                      <ArrowRight size={14} className="shrink-0 text-primary-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {active.reason && <p className="mt-3 text-[13.5px] leading-relaxed text-slate-700">{active.reason}</p>}
            {active.note && (
              <p className="mt-2 flex gap-1.5 text-[12.5px] leading-relaxed text-slate-500">
                <Info size={14} className="mt-0.5 shrink-0 text-primary-400" aria-hidden="true" />
                {active.note}
              </p>
            )}
            {activeTasks.length === 0 && nextInRange && nextInRange !== active.date && (
              <button
                type="button"
                onClick={() => setSelected(nextInRange)}
                className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] font-semibold text-primary-600 hover:text-primary-700 hover:underline"
              >
                View {formatLongDate(nextInRange)}
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
