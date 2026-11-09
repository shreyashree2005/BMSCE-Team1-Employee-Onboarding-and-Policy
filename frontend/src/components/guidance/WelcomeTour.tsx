import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { COMPANY } from "../../config/company";
import { SectionIllustration, type IllustrationName } from "../illustrations/SectionIllustration";
import { Button } from "../ui/Button";

interface TourStep {
  illustration: IllustrationName;
  title: string;
  body: string;
  points?: string[];
}

function steps(firstName: string): TourStep[] {
  return [
    {
      illustration: "welcome",
      title: `Welcome to ${COMPANY.name}${firstName ? `, ${firstName}` : ""}!`,
      body: "This portal guides you through onboarding one step at a time. Here's a one-minute tour of where everything is.",
    },
    {
      illustration: "progress",
      title: "Your onboarding tasks",
      body: "Your Home page shows Your Next Step and Today's Tasks, so you always know what to do first.",
      points: ["Open All tasks to see everything, filtered by Pending, In progress or Completed.", "High-priority tasks and deadlines are clearly marked."],
    },
    {
      illustration: "ready",
      title: "Complete and submit tasks",
      body: "Open a task and select Start task. Then do the steps: fill in a form, tick a checklist or finish a training module.",
      points: ["A task is marked Completed only after it's saved and confirmed.", "Some tasks unlock after another one, such as completing your profile first."],
    },
    {
      illustration: "documentation",
      title: "Upload your documents",
      body: "Document tasks have an upload slot for each document. Use PDF, JPG or PNG files of up to 5 MB.",
      points: ["You can view or replace a file before you submit."],
    },
    {
      illustration: "training",
      title: "Policies and quizzes",
      body: "Read each company policy, acknowledge it, then take a quick understanding quiz to check you've got the key points.",
      points: ["You'll see the correct answer and an explanation for every question.", "You can retake a quiz as often as you need."],
    },
    {
      illustration: "helpdesk",
      title: "Help is always close",
      body: "Stuck or have a question? Raise a ticket in the Help Desk and track its status there.",
    },
    {
      illustration: "progress",
      title: "Track your progress",
      body: "Your progress and the onboarding calendar show what's done, what's next and why some days have no tasks, such as weekends and company holidays.",
      points: ["You can replay this tour any time from Settings or the Help Desk."],
    },
  ];
}

interface WelcomeTourProps {
  firstName: string;
  onFinish: () => void;
  /** Skip the tour; with "Don't show this again" it won't appear on future sign-ins. */
  onSkip: (dontShowAgain: boolean) => void;
}

/** Step-by-step introduction to the portal, shown on an employee's first visit (and on demand). */
export function WelcomeTour({ firstName, onFinish, onSkip }: WelcomeTourProps) {
  const all = steps(firstName);
  const [index, setIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const step = all[index];
  const last = index === all.length - 1;

  useEffect(() => {
    dialogRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSkip(dontShowAgain);
      if (event.key === "ArrowRight" && !last) setIndex((i) => i + 1);
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onSkip, dontShowAgain, last]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-navy-950/50 backdrop-blur-[2px]" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        className="relative w-full max-w-md animate-scale-in overflow-hidden rounded-t-panel bg-white shadow-pop outline-none sm:rounded-panel"
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-xs font-medium text-slate-500" aria-live="polite">
            Step {index + 1} of {all.length}
          </span>
          <button type="button" onClick={() => onSkip(dontShowAgain)} className="focus-ring rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-surface hover:text-navy-900">
            Skip tour
          </button>
        </div>

        <div key={index} className="animate-fade-up px-6 pb-2 pt-2 text-center">
          <div className="mx-auto flex h-36 w-48 items-center justify-center">
            <SectionIllustration name={step.illustration} className="h-36 w-48" />
          </div>
          <h2 id="tour-title" className="mt-2 text-lg font-semibold tracking-tight text-primary-700">
            {step.title}
          </h2>
          <p id="tour-body" className="mt-2 text-[13.5px] leading-relaxed text-slate-600">
            {step.body}
          </p>
          {step.points && (
            <ul className="mx-auto mt-3 max-w-sm space-y-1.5 text-left">
              {step.points.map((point) => (
                <li key={point} className="flex gap-2 text-[12.5px] text-slate-600">
                  <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-center gap-1.5 py-3" aria-hidden="true">
          {all.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-5 bg-primary-500" : "w-1.5 bg-slate-200"}`} />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3.5">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={dontShowAgain} onChange={(e) => setDontShowAgain(e.target.checked)} className="focus-ring h-4 w-4 rounded accent-primary-500" />
            Don't show this again
          </label>
          <div className="ml-auto flex gap-2">
            {index > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setIndex((i) => i - 1)}>
                <ArrowLeft size={14} aria-hidden="true" />
                Back
              </Button>
            )}
            {last ? (
              <Button size="sm" onClick={onFinish}>
                Get started
                <Check size={14} aria-hidden="true" />
              </Button>
            ) : (
              <Button size="sm" onClick={() => setIndex((i) => i + 1)}>
                Next
                <ArrowRight size={14} aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
