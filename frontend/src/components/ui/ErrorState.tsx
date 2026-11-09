import type { ReactNode } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { Button } from "./Button";

interface ErrorStateProps {
  title: string;
  message: string;
  onRetry?: () => void;
  hint?: ReactNode;
}

export function ErrorState({ title, message, onRetry, hint }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <CloudOff size={22} aria-hidden="true" />
      </span>
      <p className="mt-4 text-[15px] font-semibold text-navy-900">{title}</p>
      <p className="mt-1 max-w-md text-[13px] leading-relaxed text-slate-500">{message}</p>
      {onRetry && (
        <Button className="mt-5" onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" />
          Try again
        </Button>
      )}
      {hint && <div className="mt-4 max-w-md text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
