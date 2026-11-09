import type { CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Timer } from "lucide-react";
import { useOnboarding } from "../../context/OnboardingContext";
import { useTaskActions } from "../../hooks/useTaskActions";
import { formatDuration } from "../../utils/format";
import { getCompletionMessage, isBlocked } from "../../utils/onboarding";
import { SectionIllustration } from "../illustrations/SectionIllustration";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

const COLORS = ["#346FE7", "#10B981", "#F59E0B", "#F43F5E", "#8EB0F2"];

/** A light burst of confetti (pure CSS; disabled when the OS asks for reduced motion). */
function Confetti() {
  return (
    <span className="pointer-events-none absolute inset-x-0 top-10 flex justify-center" aria-hidden="true">
      {Array.from({ length: 22 }, (_, i) => {
        const angle = (i / 22) * Math.PI * 2;
        const distance = 70 + (i % 4) * 22;
        const style = {
          "--confetti-x": `${Math.round(Math.cos(angle) * distance)}px`,
          "--confetti-y": `${Math.round(Math.sin(angle) * distance * 0.8 + 40)}px`,
          "--confetti-r": `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`,
          backgroundColor: COLORS[i % COLORS.length],
          animationDelay: `${(i % 5) * 30}ms`,
        } as CSSProperties;
        return <span key={i} className={`absolute h-2 w-1.5 animate-confetti rounded-[1px] ${i % 3 === 0 ? "rounded-full" : ""}`} style={style} />;
      })}
    </span>
  );
}

/**
 * Shown once when the server confirms a task is complete (callers pass the server's copy of the task).
 * The message depends on what is left: the next step, all of today's tasks done, or the whole journey done.
 */
export function TaskCelebration() {
  const { tasks, celebration, dismissCelebration } = useOnboarding();
  const { updateStatus } = useTaskActions();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!celebration) return null;

  // Use the latest task list, with the celebrated task certainly marked complete.
  const current = tasks.map((t) => (t.id === celebration.id ? { ...t, ...celebration, status: "completed" as const } : t));
  const { kind, title, message, next } = getCompletionMessage(current);
  const completed = current.find((t) => t.id === celebration.id) ?? celebration;
  const duration = completed.timeSpentSeconds != null && completed.firstStartedAt ? formatDuration(completed.timeSpentSeconds) : null;

  const startNext = async () => {
    if (!next) return;
    dismissCelebration();
    if (next.status === "pending" && !isBlocked(next, current)) await updateStatus(next, "in_progress");
    const base = pathname === "/onboarding" ? "/onboarding" : "/";
    navigate(`${base}?task=${encodeURIComponent(next.id)}`);
  };

  return (
    <Modal
      open
      title={kind === "journey" ? "Onboarding complete" : "Task completed"}
      onClose={dismissCelebration}
      footer={
        <>
          <Button variant="secondary" onClick={dismissCelebration}>
            {kind === "task" ? "Later" : "Close"}
          </Button>
          {next && kind === "task" && (
            <Button onClick={() => void startNext()}>
              {next.status === "in_progress" ? "Continue next task" : "Start next task"}
              <ArrowRight size={15} aria-hidden="true" />
            </Button>
          )}
          {next && kind === "day" && !isBlocked(next, current) && (
            // Today's work is done; starting early is optional.
            <Button variant="ghost" onClick={() => void startNext()}>
              Get a head start
              <ArrowRight size={15} aria-hidden="true" />
            </Button>
          )}
        </>
      }
    >
      <div className="relative text-center" role="status">
        <Confetti />
        <div className="mx-auto flex h-28 w-40 items-center justify-center">
          <SectionIllustration name={kind === "journey" ? "ready" : "progress"} className="h-28 w-40" />
        </div>
        <p className="mt-2 text-xl font-semibold text-primary-700">{title}</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-700">{message}</p>
        <p className="mt-3 text-[13px] text-slate-500">
          “{completed.title}”{duration && (
            <span className="ml-1 inline-flex items-center gap-1 whitespace-nowrap">
              <Timer size={12} aria-hidden="true" />
              Completed in {duration}
            </span>
          )}
        </p>
        {next && (
          <div className="mx-auto mt-4 max-w-sm rounded-lg border border-line bg-surface px-4 py-3 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{kind === "task" ? "Recommended next task" : "Coming up next"}</p>
            <p className="mt-0.5 text-[13.5px] font-semibold text-navy-900">{next.title}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
