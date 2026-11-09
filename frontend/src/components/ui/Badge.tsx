import type { ReactNode } from "react";

export type BadgeTone = "blue" | "green" | "amber" | "red" | "gray";

const toneClasses: Record<BadgeTone, string> = {
  blue: "bg-primary-50 text-primary-700 ring-primary-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  red: "bg-rose-50 text-rose-700 ring-rose-100",
  gray: "bg-slate-50 text-slate-600 ring-slate-200",
};

const dotClasses: Record<BadgeTone, string> = {
  blue: "bg-primary-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  gray: "bg-slate-400",
};

interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}

export function Badge({ tone = "gray", dot = false, children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClasses[tone]}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotClasses[tone]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}
