import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";

type ToastTone = "success" | "info" | "error";

const toneStyles: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  success: { icon: CircleCheck, className: "text-emerald-600" },
  info: { icon: Info, className: "text-primary-500" },
  error: { icon: TriangleAlert, className: "text-rose-600" },
};

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef<number[]>([]);

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = "success") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
      timers.current.push(window.setTimeout(() => dismiss(id), TOAST_DURATION_MS));
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => {
          const { icon: Icon, className: iconClass } = toneStyles[toast.tone];
          return (
            <div key={toast.id} className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-white p-3.5 shadow-pop">
              <Icon size={18} className={`mt-0.5 shrink-0 ${iconClass}`} aria-hidden="true" />
              <p className="flex-1 text-sm text-navy-900">{toast.message}</p>
              <button type="button" onClick={() => dismiss(toast.id)} className="focus-ring rounded text-slate-400 hover:text-slate-600" aria-label="Dismiss notification">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
