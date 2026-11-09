import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, message, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center px-6 text-center ${compact ? "py-8" : "py-12"}`}>
      <span className="relative flex h-12 w-12 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-primary-50" aria-hidden="true" />
        <span className="absolute inset-[-6px] rounded-full border border-dashed border-primary-200" aria-hidden="true" />
        <Icon size={20} className="relative text-primary-500" aria-hidden="true" />
      </span>
      <p className="mt-4 text-sm font-semibold text-navy-900">{title}</p>
      <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-slate-500">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
