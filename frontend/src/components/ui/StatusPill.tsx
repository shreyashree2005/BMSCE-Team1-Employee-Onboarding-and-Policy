import type { ReactNode } from "react";

export type StatusTone = "neutral" | "blue" | "amber" | "green" | "red";

/** One look for every status in the app (tasks, tickets): soft tint, coloured dot, short label. */
const toneClasses: Record<StatusTone, { pill: string; dot: string }> = {
  neutral: { pill: "bg-slate-50 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
  blue: { pill: "bg-primary-50 text-primary-700 ring-primary-100", dot: "bg-primary-500" },
  amber: { pill: "bg-amber-50 text-amber-800 ring-amber-100", dot: "bg-amber-500" },
  green: { pill: "bg-emerald-50 text-emerald-700 ring-emerald-100", dot: "bg-emerald-500" },
  red: { pill: "bg-rose-50 text-rose-700 ring-rose-100", dot: "bg-rose-500" },
};

interface StatusPillProps {
  tone: StatusTone;
  children: ReactNode;
  size?: "sm" | "md";
  testId?: string;
}

export function StatusPill({ tone, children, size = "md", testId }: StatusPillProps) {
  const classes = toneClasses[tone];
  const sizing = size === "sm" ? "gap-1 px-1.5 py-px text-[10.5px]" : "gap-1.5 px-2 py-0.5 text-[11px]";
  return (
    <span data-testid={testId} className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-semibold ring-1 ring-inset ${sizing} ${classes.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${classes.dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}
