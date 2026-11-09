import { useState } from "react";
import { Check, ChevronDown, CircleCheck } from "lucide-react";
import { Button } from "../../ui/Button";
import { ProgressBar } from "../../ui/ProgressBar";
import { QuizForm } from "./QuizForm";
import type { ActionControls } from "./TaskActionPanel";

/** Training modules to read and mark complete, followed by a quiz when the training has one. */
export function TrainingAction({ state, busy, submit }: ActionControls) {
  const firstOpen = state.sections.find((s) => !s.completed)?.id ?? null;
  const [open, setOpen] = useState<string | null>(firstOpen);
  const done = state.sections.filter((s) => s.completed).length;
  const allRead = done === state.sections.length;

  const markComplete = async (id: string) => {
    const ok = await submit({ completedSection: id });
    if (ok) {
      const next = state.sections.find((s) => !s.completed && s.id !== id);
      setOpen(next?.id ?? null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>Modules</span>
          <span>
            {done} of {state.sections.length} complete
          </span>
        </div>
        <ProgressBar value={state.sections.length ? Math.round((done / state.sections.length) * 100) : 0} size="sm" label="Training progress" />
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {state.sections.map((section) => {
          const expanded = open === section.id;
          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : section.id)}
                aria-expanded={expanded}
                className="focus-ring flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface"
              >
                {section.completed ? <CircleCheck size={16} className="shrink-0 text-emerald-600" aria-label="Completed" /> : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-line-strong" aria-hidden="true" />}
                <span className="flex-1 text-[13px] font-medium text-navy-900">{section.title}</span>
                <ChevronDown size={15} className={`text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              {expanded && (
                <div className="space-y-2 px-3 pb-3 pl-9">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="text-[13px] leading-relaxed text-slate-600">
                      {paragraph}
                    </p>
                  ))}
                  {!section.completed && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void markComplete(section.id)}>
                      <Check size={14} aria-hidden="true" />
                      Mark module complete
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {state.quiz &&
        (allRead ? (
          <QuizForm quiz={state.quiz} busy={busy} onSubmit={(answers) => submit({ answers })} />
        ) : (
          <p className="text-xs text-slate-500">Complete every module to unlock the quiz ({state.quiz.passMark}% to pass).</p>
        ))}
    </div>
  );
}
