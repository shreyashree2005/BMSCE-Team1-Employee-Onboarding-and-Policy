import { useState, type FormEvent } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import type { QuizState } from "../../../types/taskActions";
import { Button } from "../../ui/Button";

interface QuizFormProps {
  quiz: QuizState;
  busy: boolean;
  onSubmit: (answers: Record<string, number>) => Promise<boolean>;
}

/** Multiple-choice quiz graded by the server (answers are never sent to the browser). */
export function QuizForm({ quiz, busy, onSubmit }: QuizFormProps) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const results = new Map(quiz.lastResults.map((r) => [r.questionId, r.correct]));
  const complete = quiz.questions.every((q) => answers[q.id] !== undefined);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (complete) await onSubmit(answers);
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h5 className="text-[13px] font-semibold text-navy-900">Quiz</h5>
        <span className="text-xs text-slate-500">
          Pass mark {quiz.passMark}%{quiz.attempts > 0 && ` · best score ${quiz.bestScore}% · ${quiz.attempts} attempt${quiz.attempts === 1 ? "" : "s"}`}
        </span>
      </div>
      {quiz.passed ? (
        <p className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-800">
          <CircleCheck size={15} aria-hidden="true" />
          Passed with {quiz.bestScore}%.
        </p>
      ) : (
        <>
          {quiz.questions.map((question, index) => (
            <fieldset key={question.id} className="space-y-1.5">
              <legend className="flex items-start gap-1.5 text-[13px] font-medium text-navy-900">
                {index + 1}. {question.question}
                {results.has(question.id) &&
                  (results.get(question.id) ? (
                    <CircleCheck size={14} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Correct last time" />
                  ) : (
                    <CircleX size={14} className="mt-0.5 shrink-0 text-rose-500" aria-label="Incorrect last time" />
                  ))}
              </legend>
              {question.options.map((option, optionIndex) => (
                <label key={option} className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-slate-700 hover:bg-surface">
                  <input
                    type="radio"
                    name={`quiz-${question.id}`}
                    checked={answers[question.id] === optionIndex}
                    disabled={busy}
                    onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: optionIndex }))}
                    className="focus-ring h-4 w-4 accent-primary-500"
                  />
                  {option}
                </label>
              ))}
            </fieldset>
          ))}
          {quiz.lastScore !== null && !quiz.passed && (
            <p className="text-[12.5px] text-rose-700">Last attempt: {quiz.lastScore}%. Review the questions marked incorrect and try again.</p>
          )}
          <Button type="submit" size="sm" disabled={busy || !complete}>
            Submit answers
          </Button>
        </>
      )}
    </form>
  );
}
