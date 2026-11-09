type ProgressTone = "blue" | "green" | "amber" | "slate" | "white";

const fillClasses: Record<ProgressTone, string> = {
  blue: "bg-gradient-to-r from-primary-400 to-primary-600",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  slate: "bg-slate-400",
  white: "bg-white",
};

interface ProgressBarProps {
  value: number;
  size?: "xs" | "sm" | "md";
  tone?: ProgressTone;
  /** Track colour; use "dark" on navy backgrounds. */
  track?: "light" | "dark";
  label?: string;
}

const heights = { xs: "h-1", sm: "h-1.5", md: "h-2" };

export function ProgressBar({ value, size = "md", tone = "blue", track = "light", label }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={`w-full overflow-hidden rounded-full ${track === "dark" ? "bg-white/15" : "bg-primary-50"} ${heights[size]}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`${heights[size]} origin-left animate-grow-x rounded-full ${fillClasses[tone]} transition-[width] duration-500`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
