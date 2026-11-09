import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, CircleCheck, CircleX, LoaderCircle, RotateCcw, Trophy } from "lucide-react";
import { useToast } from "../../context/ToastContext";
import { ApiError } from "../../services/apiClient";
import { fetchPolicyQuiz, submitPolicyQuiz } from "../../services/policyQuizApi";
import { fetchPolicyFile } from "../../services/taskActionsApi";
import type { PolicyQuiz, PolicyQuizAttempt, PolicyQuizResult } from "../../types/policyQuiz";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

interface PolicyQuizDialogProps {
  policyId: string | null;
  onClose: () => void;
  /** Called after each graded attempt (passed or not), with the server's result. */
  onGraded?: (result: PolicyQuizResult) => void;
}

function AttemptHistory({ history, passScore }: { history: PolicyQuizAttempt[]; passScore: number }) {
  if (history.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">Your attempts</p>
      <ol className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Your attempts">
        {history.map((attempt, index) => (
          <li
            key={attempt.id}
            className={`rounded-md px-2 py-1 text-xs font-semibold tabular-nums ${attempt.passed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
            title={`Attempt ${index + 1}: ${attempt.score}/${attempt.total}${attempt.passed ? " (passed)" : ""}`}
          >
            #{index + 1} · {attempt.score}/{attempt.total}
          </li>
        ))}
      </ol>
      <p className="mt-1 text-[11.5px] text-slate-400">Pass mark: {passScore} correct</p>
    </div>
  );
}

/** "Take a quick understanding quiz": 3-5 questions from the policy, graded on the server with explanations. */
export function PolicyQuizDialog({ policyId, onClose, onGraded }: PolicyQuizDialogProps) {
  const { showToast } = useToast();
  const [quiz, setQuiz] = useState<PolicyQuiz | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<PolicyQuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!policyId) return;
    const controller = new AbortController();
    setQuiz(null);
    setLoadError(null);
    setAnswers({});
    setResult(null);
    fetchPolicyQuiz(policyId, controller.signal)
      .then(setQuiz)
      .catch((caught: unknown) => !controller.signal.aborted && setLoadError(caught instanceof ApiError ? caught.message : "The quiz couldn't be loaded."));
    return () => controller.abort();
  }, [policyId]);

  const complete = quiz ? quiz.questions.every((q) => answers[q.id] !== undefined) : false;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!quiz || !complete) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const graded = await submitPolicyQuiz(quiz.policyId, answers);
      setResult(graded);
      setQuiz({ ...quiz, history: graded.history, passed: quiz.passed || graded.passed });
      onGraded?.(graded);
    } catch (caught) {
      setSubmitError(caught instanceof ApiError ? caught.message : "Your answers couldn't be submitted. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const retake = () => {
    setAnswers({});
    setResult(null);
  };

  const reviewPolicy = async () => {
    if (!quiz?.documentId) return;
    try {
      const url = URL.createObjectURL(await fetchPolicyFile(quiz.documentId));
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      showToast(caught instanceof ApiError ? caught.message : "The policy couldn't be opened.", "error");
    }
  };

  const footer = (
    <>
      {quiz?.documentId && (
        <Button variant="ghost" onClick={() => void reviewPolicy()}>
          <BookOpen size={15} aria-hidden="true" />
          Review the policy
        </Button>
      )}
      {result && !result.passed && (
        <Button variant="secondary" onClick={retake}>
          <RotateCcw size={15} aria-hidden="true" />
          Retake quiz
        </Button>
      )}
      {result ? (
        <Button onClick={onClose}>{result.passed ? "Done" : "Close"}</Button>
      ) : (
        <Button type="submit" form="policy-quiz-form" disabled={!complete || submitting}>
          {submitting && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}
          Submit answers
        </Button>
      )}
    </>
  );

  return (
    <Modal open={Boolean(policyId)} size="lg" title={quiz ? `Quick understanding quiz · ${quiz.title}` : "Quick understanding quiz"} onClose={onClose} footer={quiz ? footer : undefined}>
      {loadError && <p role="alert" className="text-[13px] text-rose-700">{loadError}</p>}
      {!quiz && !loadError && (
        <p role="status" className="flex items-center gap-2 text-[13px] text-slate-500">
          <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
          Loading quiz…
        </p>
      )}

      {quiz && !result && (
        <form id="policy-quiz-form" onSubmit={submit} className="space-y-5">
          <p className="text-[13px] text-slate-600">
            {quiz.questionCount} questions based on the {quiz.title}. Get {quiz.passScore} or more right to pass{quiz.passed ? " (you've already passed; you can practise again)" : ""}.
          </p>
          {quiz.questions.map((question, index) => (
            <fieldset key={question.id} className="space-y-1.5">
              <legend className="text-[13.5px] font-semibold text-navy-900">
                {index + 1}. {question.question}
              </legend>
              {question.options.map((option, optionIndex) => (
                <label
                  key={option}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors ${
                    answers[question.id] === optionIndex ? "border-primary-300 bg-primary-50 text-navy-900" : "border-line text-slate-700 hover:bg-surface"
                  }`}
                >
                  <input
                    type="radio"
                    name={`policy-quiz-${question.id}`}
                    checked={answers[question.id] === optionIndex}
                    onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: optionIndex }))}
                    className="focus-ring h-4 w-4 accent-primary-500"
                  />
                  {option}
                </label>
              ))}
            </fieldset>
          ))}
          {submitError && <p role="alert" className="text-[13px] text-rose-700">{submitError}</p>}
          <AttemptHistory history={quiz.history} passScore={quiz.passScore} />
        </form>
      )}

      {quiz && result && (
        <div className="space-y-4">
          <div className={`flex items-start gap-3 rounded-lg px-4 py-3 ${result.passed ? "bg-emerald-50" : "bg-amber-50"}`} role="status">
            {result.passed ? <Trophy size={22} className="shrink-0 text-emerald-600" aria-hidden="true" /> : <RotateCcw size={20} className="shrink-0 text-amber-600" aria-hidden="true" />}
            <div>
              <p className="text-lg font-semibold tabular-nums text-navy-900">
                Your Score: {result.score}/{result.total}
              </p>
              <p className="text-[13px] text-slate-700">{result.message.replace(/^Your Score: \d+\/\d+\.\s*/, "")}</p>
            </div>
          </div>

          <ol className="space-y-3">
            {result.results.map((item, index) => (
              <li key={item.id} className={`rounded-lg border p-3 ${item.correct ? "border-emerald-200" : "border-rose-200"}`}>
                <p className="flex items-start gap-2 text-[13px] font-semibold text-navy-900">
                  {item.correct ? <CircleCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Correct" /> : <CircleX size={16} className="mt-0.5 shrink-0 text-rose-500" aria-label="Incorrect" />}
                  {index + 1}. {item.question}
                </p>
                <p className={`mt-1.5 pl-6 text-[13px] ${item.correct ? "text-emerald-700" : "text-rose-700"}`}>
                  {item.correct ? item.feedback : <>Your answer: {item.options[item.chosen]}. {item.feedback}</>}
                </p>
                <p className="mt-1 pl-6 text-[12.5px] leading-relaxed text-slate-600">
                  <span className="font-semibold">Why: </span>
                  {item.explanation}
                </p>
              </li>
            ))}
          </ol>
          <AttemptHistory history={result.history} passScore={result.passScore} />
        </div>
      )}
    </Modal>
  );
}
