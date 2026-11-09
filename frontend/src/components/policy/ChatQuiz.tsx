import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleCheck, CircleX, ClipboardCheck, FileText, Loader2, MessageSquare, RotateCcw, X } from "lucide-react";
import { ApiError } from "../../services/apiClient";
import { buildAnswerQuiz, submitAnswerQuiz } from "../../services/policyQuizApi";
import type { PolicyCitation } from "../../types/policyAssistant";
import type { AnswerQuiz, PolicyQuizResult, PolicyQuizSource } from "../../types/policyQuiz";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import { citationLocation } from "./CitationCard";

type Stage = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "quiz" } | { kind: "submitting" } | { kind: "result"; result: PolicyQuizResult };

interface ChatQuizProps {
  /** Chunk IDs of the answer's citations, in citation order: the quiz is built from these passages. */
  chunkIds: number[];
  /** Opens a question's source passage in the source preview. */
  onShowSource: (citation: PolicyCitation) => void;
  /** "Continue Chat": hand the focus back to the question box. */
  onContinue: () => void;
}

/** Shapes a quiz question's source like an answer citation, for the source preview panel. */
function sourceCitation(source: PolicyQuizSource, label: string): PolicyCitation {
  return { sourceId: label, chunkId: source.chunkId, documentId: source.documentId, documentName: source.documentName, pageNumber: source.pageNumber, section: source.section, excerpt: source.excerpt, score: -1 };
}

/**
 * A 5-question quiz on one assistant answer, shown inside the conversation right below that answer. The questions are
 * built on the server from the answer's own policy passages, the server grades the attempt, and the result stays in
 * the conversation.
 */
export function ChatQuiz({ chunkIds, onShowSource, onContinue }: ChatQuizProps) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [quiz, setQuiz] = useState<AnswerQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const requestInFlight = useRef(false); // guards against double clicks before the state update lands
  const regionRef = useRef<HTMLDivElement>(null);

  const start = async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setStage({ kind: "loading" });
    try {
      const built = quiz ?? (await buildAnswerQuiz(chunkIds));
      setQuiz(built);
      setAnswers({});
      setIndex(0);
      setSubmitError(null);
      setStage({ kind: "quiz" });
      window.requestAnimationFrame(() => regionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    } catch (caught) {
      setStage({ kind: "error", message: caught instanceof ApiError ? caught.message : "The quiz couldn't be prepared. Please try again." });
    } finally {
      requestInFlight.current = false;
    }
  };

  const submit = async () => {
    if (!quiz || requestInFlight.current) return;
    requestInFlight.current = true;
    setSubmitError(null);
    setStage({ kind: "submitting" });
    try {
      const result = await submitAnswerQuiz(quiz.chunkIds, answers);
      setStage({ kind: "result", result });
    } catch (caught) {
      setSubmitError(caught instanceof ApiError ? caught.message : "Your answers couldn't be submitted. Please try again.");
      setStage({ kind: "quiz" });
    } finally {
      requestInFlight.current = false;
    }
  };

  if (stage.kind === "idle" || stage.kind === "loading" || stage.kind === "error") {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2.5 px-1">
        <Button size="sm" variant="secondary" onClick={() => void start()} disabled={stage.kind === "loading"} aria-busy={stage.kind === "loading"}>
          {stage.kind === "loading" ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <ClipboardCheck size={14} aria-hidden="true" />}
          {stage.kind === "loading" ? "Preparing your quiz…" : "Take a 5-Question Quiz"}
        </Button>
        {stage.kind === "idle" && <span className="text-[11.5px] text-slate-500">Check what you've learned from this answer.</span>}
        {stage.kind === "error" && (
          <p role="alert" className="text-[12px] text-rose-600">
            {stage.message}
          </p>
        )}
      </div>
    );
  }

  if (!quiz) return null;
  const total = quiz.questions.length;

  if (stage.kind === "result") {
    const { result } = stage;
    const percent = Math.round((result.score / result.total) * 100);
    const wrong = result.total - result.score;
    return (
      <section ref={regionRef} aria-label="Quiz result" className="mt-3 animate-fade-in rounded-2xl border border-primary-100 bg-white shadow-card">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-primary-100 bg-primary-50/50 px-4 py-4 sm:px-5">
          <div>
            <p className="eyebrow text-primary-500">{quiz.title}</p>
            <p className="mt-1 text-[20px] font-bold text-primary-800">
              Your Score: {result.score}/{result.total}
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
            <div>
              <dt className="text-slate-500">Percentage</dt>
              <dd className="font-semibold text-navy-900">{percent}%</dd>
            </div>
            <div>
              <dt className="text-slate-500">Correct</dt>
              <dd className="font-semibold text-emerald-700">{result.score}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Incorrect</dt>
              <dd className="font-semibold text-rose-700">{wrong}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd className="font-semibold text-navy-900">Completed</dd>
            </div>
          </dl>
        </header>
        <p className="px-4 pt-3 text-[12.5px] text-slate-600 sm:px-5">{result.message}</p>
        <ol className="space-y-2.5 px-4 py-3 sm:px-5" aria-label="Answers and explanations">
          {result.results.map((r, i) => (
            <li key={r.id} className={`rounded-xl border p-3 ${r.correct ? "border-emerald-100 bg-emerald-50/40" : "border-rose-100 bg-rose-50/40"}`}>
              <p className="flex items-start gap-2 text-[13px] font-semibold text-navy-900">
                {r.correct ? <CircleCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Correct" /> : <CircleX size={16} className="mt-0.5 shrink-0 text-rose-600" aria-label="Incorrect" />}
                <span>
                  {i + 1}. {r.question}
                </span>
              </p>
              <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 pl-6 text-[12.5px] sm:grid-cols-2">
                <div>
                  <dt className="inline text-slate-500">Your answer: </dt>
                  <dd className={`inline font-semibold ${r.correct ? "text-emerald-700" : "text-rose-700"}`}>{r.options[r.chosen]}</dd>
                </div>
                <div>
                  <dt className="inline text-slate-500">Correct answer: </dt>
                  <dd className="inline font-semibold text-emerald-700">{r.options[r.correctOption]}</dd>
                </div>
              </dl>
              <p className="mt-1.5 pl-6 text-[12.5px] leading-relaxed text-slate-600">{r.explanation}</p>
              {r.source && (
                <button
                  type="button"
                  onClick={() => onShowSource(sourceCitation(r.source!, `Q${i + 1}`))}
                  className="focus-ring ml-6 mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11.5px] font-medium text-primary-700 ring-1 ring-inset ring-primary-100 hover:bg-primary-50"
                  aria-label={`Show the policy source for question ${i + 1}`}
                >
                  <FileText size={12} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {r.source.documentName} · {citationLocation(sourceCitation(r.source, ""))}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ol>
        <footer className="flex flex-wrap gap-2 border-t border-line px-4 py-3 sm:px-5">
          <Button size="sm" variant="secondary" onClick={() => void start()}>
            <RotateCcw size={13} aria-hidden="true" />
            Retake Quiz
          </Button>
          <Button size="sm" onClick={onContinue}>
            <MessageSquare size={13} aria-hidden="true" />
            Continue Chat
          </Button>
        </footer>
      </section>
    );
  }

  const question = quiz.questions[index];
  const chosen = answers[question.id];
  const answered = Object.keys(answers).length;
  const last = index === total - 1;
  const submitting = stage.kind === "submitting";
  const groupId = `quiz-q-${question.id}`;

  return (
    <section ref={regionRef} aria-label={quiz.title} className="mt-3 animate-fade-in rounded-2xl border border-primary-100 bg-white shadow-card">
      <header className="border-b border-primary-100 px-4 pb-3 pt-3.5 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow text-primary-500">{quiz.title}</p>
          <button type="button" onClick={() => setStage({ kind: "idle" })} className="focus-ring rounded p-1 text-slate-400 hover:text-navy-900" aria-label="Close quiz">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1.5 text-[12.5px] font-semibold text-navy-900">
          Question {index + 1} of {total}
        </p>
        <div className="mt-2">
          <ProgressBar value={((index + 1) / total) * 100} size="xs" label={`Question ${index + 1} of ${total}`} />
        </div>
      </header>
      <div className="px-4 py-4 sm:px-5">
        <fieldset aria-labelledby={`${groupId}-label`}>
          <legend id={`${groupId}-label`} className="text-[14px] font-semibold leading-snug text-navy-900">
            {question.question}
          </legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {question.options.map((option, optionIndex) => {
              const selected = chosen === optionIndex;
              return (
                <label
                  key={option}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] transition-colors focus-within:ring-2 focus-within:ring-primary-200 ${
                    selected ? "border-primary-400 bg-primary-50 font-semibold text-primary-800" : "border-line bg-white text-slate-700 hover:border-primary-200 hover:bg-primary-50/40"
                  }`}
                >
                  <input
                    type="radio"
                    name={groupId}
                    checked={selected}
                    onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: optionIndex }))}
                    className="h-4 w-4 accent-primary-600"
                  />
                  {option}
                  {selected && <Check size={14} className="ml-auto text-primary-600" aria-hidden="true" />}
                </label>
              );
            })}
          </div>
        </fieldset>
        {submitError && (
          <p role="alert" className="mt-3 text-[12.5px] text-rose-600">
            {submitError}
          </p>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 sm:px-5">
        <Button size="sm" variant="ghost" onClick={() => setIndex((i) => i - 1)} disabled={index === 0 || submitting}>
          <ArrowLeft size={13} aria-hidden="true" />
          Previous
        </Button>
        <span className="text-[11.5px] text-slate-500">
          {answered} of {total} answered
        </span>
        {last ? (
          <Button size="sm" onClick={() => void submit()} disabled={answered < total || submitting}>
            {submitting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
            {submitting ? "Submitting…" : "Submit Quiz"}
          </Button>
        ) : (
          <Button size="sm" onClick={() => setIndex((i) => i + 1)} disabled={chosen === undefined}>
            Next
            <ArrowRight size={13} aria-hidden="true" />
          </Button>
        )}
      </footer>
    </section>
  );
}
