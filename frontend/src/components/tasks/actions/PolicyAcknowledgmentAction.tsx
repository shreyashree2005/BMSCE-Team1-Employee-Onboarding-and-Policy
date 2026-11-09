import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, BookOpen, CircleCheck, Download, GraduationCap, LoaderCircle } from "lucide-react";
import { useCurrentUser } from "../../../context/AuthContext";
import { ApiError } from "../../../services/apiClient";
import { fetchPolicyFile } from "../../../services/taskActionsApi";
import type { PolicyToAcknowledge } from "../../../types/taskActions";
import { PolicyQuizDialog } from "../../quiz/PolicyQuizDialog";
import { Button } from "../../ui/Button";
import type { ActionControls } from "./TaskActionPanel";

/** Loads a published policy file (with the session cookie) and shows it inline: PDF/TXT in a frame, DOCX as a download. */
function PolicyViewer({ policy }: { policy: PolicyToAcknowledge }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchPolicyFile(policy.documentId!)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((caught: unknown) => !cancelled && setError(caught instanceof ApiError ? caught.message : "The policy couldn't be loaded."));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [policy.documentId]);

  if (error) return <p role="alert" className="text-[12px] text-rose-600">{error}</p>;
  if (!url) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-xs text-slate-500">
        <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
        Loading policy…
      </p>
    );
  }
  if (policy.fileType === "docx") {
    return (
      <a href={url} download={policy.filename ?? "policy.docx"} className="focus-ring inline-flex items-center gap-1.5 rounded text-[13px] font-semibold text-primary-600 hover:underline">
        <Download size={14} aria-hidden="true" />
        Download {policy.title} (Word document)
      </a>
    );
  }
  return <iframe src={url} title={policy.title} className="h-80 w-full rounded-md border border-line bg-white" />;
}

interface PolicyAcknowledgmentActionProps extends ActionControls {
  /** A quiz attempt passed; receives the IDs of tasks the server completed because of it. */
  onQuizPassed: (completedTaskIds: string[]) => void;
}

/** Read each policy, acknowledge it, sign with your full name, then pass each policy's quick understanding quiz. */
export function PolicyAcknowledgmentAction({ state, busy, fieldErrors, submit, onQuizPassed }: PolicyAcknowledgmentActionProps) {
  const user = useCurrentUser();
  const [quizPolicy, setQuizPolicy] = useState<string | null>(null);
  // Tasks completed by a passed quiz; announced after the dialog closes so the results can be read first.
  const [completedByQuiz, setCompletedByQuiz] = useState<string[] | null>(null);
  const allAcknowledged = state.policies.length > 0 && state.policies.every((p) => p.acknowledged);
  const quizzesLeft = state.policies.filter((p) => p.quizAvailable && !p.quizPassed);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set(state.policies.filter((p) => p.acknowledged).map((p) => p.policyId)));
  const [opened, setOpened] = useState<Set<string>>(new Set(state.policies.filter((p) => p.acknowledged).map((p) => p.policyId)));
  const [signature, setSignature] = useState(state.signature ?? "");
  const unavailable = state.policies.filter((p) => !p.available);
  const ready = unavailable.length === 0 && state.policies.every((p) => acknowledged.has(p.policyId)) && signature.trim().length > 0;

  const toggle = (policyId: string) =>
    setAcknowledged((prev) => {
      const next = new Set(prev);
      if (next.has(policyId)) next.delete(policyId);
      else next.add(policyId);
      return next;
    });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit({ acknowledgedPolicies: [...acknowledged], signature });
  };

  return (
    <>
    <form onSubmit={onSubmit} className="space-y-3">
      {unavailable.length > 0 && (
        <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {unavailable.map((p) => p.title).join(", ")} {unavailable.length === 1 ? "hasn't" : "haven't"} been published by HR yet, so this task can't be completed now. Please contact HR.
        </p>
      )}
      <ul className="space-y-2">
        {state.policies.map((policy) => (
          <li key={policy.policyId} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-navy-900">
                {policy.title} <span className="font-normal text-slate-400">· {policy.policyId}</span>
              </p>
              {policy.available && (
                <Button size="sm" variant="ghost" onClick={() => setOpened((prev) => new Set(prev).add(policy.policyId))} disabled={opened.has(policy.policyId)}>
                  <BookOpen size={14} aria-hidden="true" />
                  {opened.has(policy.policyId) ? "Opened" : "Read policy"}
                </Button>
              )}
            </div>
            {policy.available && opened.has(policy.policyId) && (
              <div className="mt-2">
                <PolicyViewer policy={policy} />
              </div>
            )}
            {policy.available && (
              <label className="mt-2 flex items-start gap-2 text-[12.5px] text-navy-900">
                <input
                  type="checkbox"
                  checked={acknowledged.has(policy.policyId)}
                  disabled={busy || !opened.has(policy.policyId) || state.completed}
                  onChange={() => toggle(policy.policyId)}
                  className="focus-ring mt-0.5 h-4 w-4 rounded border-line-strong accent-primary-500"
                />
                <span>
                  I have read and understood the {policy.title}.{!opened.has(policy.policyId) && <span className="text-slate-400"> (Open it first.)</span>}
                </span>
              </label>
            )}
            {policy.available && policy.quizAvailable && (
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-3 py-2">
                {policy.quizPassed ? (
                  <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-700">
                    <CircleCheck size={14} aria-hidden="true" />
                    Understanding quiz passed{policy.quizBestScore != null && policy.quizTotal ? ` · best ${policy.quizBestScore}/${policy.quizTotal}` : ""}
                  </span>
                ) : (
                  <span className="text-[12.5px] text-slate-600">
                    Check your understanding{policy.quizBestScore != null && policy.quizTotal ? ` · best so far ${policy.quizBestScore}/${policy.quizTotal}` : ""}
                  </span>
                )}
                <Button size="sm" variant={policy.quizPassed ? "ghost" : "secondary"} disabled={!opened.has(policy.policyId)} onClick={() => setQuizPolicy(policy.policyId)} title={opened.has(policy.policyId) ? undefined : "Read the policy first"}>
                  <GraduationCap size={14} aria-hidden="true" />
                  {policy.quizPassed ? "Practise again" : "Take a Quick Understanding Quiz"}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!state.completed && allAcknowledged && quizzesLeft.length > 0 && (
        <p className="rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-[12.5px] text-primary-800">
          Acknowledged. Pass the understanding quiz for the {quizzesLeft.map((p) => p.title).join(" and the ")} to finish this task.
        </p>
      )}
      {!state.completed && !allAcknowledged && unavailable.length === 0 && (
        <div>
          <label htmlFor="policy-signature" className="mb-1 block text-[12.5px] font-medium text-navy-900">
            Sign with your full name
          </label>
          <input
            id="policy-signature"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder={user.fullName}
            maxLength={200}
            aria-invalid={Boolean(fieldErrors.signature)}
            className="focus-ring h-9 w-full rounded-lg border border-line-strong bg-white px-3 text-[13px] text-navy-900 focus:border-primary-400 focus:outline-none aria-[invalid=true]:border-rose-300"
          />
          {fieldErrors.signature && <p className="mt-1 text-[12px] text-rose-600">{fieldErrors.signature}</p>}
          <Button type="submit" size="sm" className="mt-3" disabled={busy || !ready}>
            Acknowledge policies
          </Button>
        </div>
      )}
      {state.completed && state.signature && <p className="text-xs text-slate-500">Signed as “{state.signature}”.</p>}
    </form>
    <PolicyQuizDialog
      policyId={quizPolicy}
      onClose={() => {
        setQuizPolicy(null);
        if (completedByQuiz) onQuizPassed(completedByQuiz);
        setCompletedByQuiz(null);
      }}
      onGraded={(result) => result.passed && setCompletedByQuiz((prev) => [...(prev ?? []), ...result.completedTaskIds])}
    />
    </>
  );
}
