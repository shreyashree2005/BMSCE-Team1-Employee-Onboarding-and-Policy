import { useEffect, useId, useState, type ReactNode } from "react";

interface ProgressRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  /** "dark" renders a translucent track for navy backgrounds. */
  track?: "light" | "dark";
  children?: ReactNode;
}

/** Circular progress indicator that animates from zero on mount and on value changes. */
export function ProgressRing({ value, size = 120, strokeWidth = 9, label, track = "light", children }: ProgressRingProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const [shown, setShown] = useState(0);
  const gradientId = `ring-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(clamped));
    return () => cancelAnimationFrame(frame);
  }, [clamped]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={track === "dark" ? "#ffffff" : "#6094fa"} />
            <stop offset="100%" stopColor={track === "dark" ? "#dbe8fe" : "#1a49ad"} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className={track === "dark" ? "stroke-white/15" : "stroke-primary-50"} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
          stroke={`url(#${gradientId})`}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  );
}
