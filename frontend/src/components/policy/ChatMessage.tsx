import { CircleAlert, Copy, LifeBuoy, RefreshCw } from "lucide-react";
import { useToast } from "../../context/ToastContext";
import type { ChatMessage as ChatMessageData, PolicyCitation } from "../../types/policyAssistant";
import { Avatar } from "../ui/Avatar";
import { AssistantMark } from "../ui/AssistantMark";
import { Button } from "../ui/Button";
import { ChatQuiz } from "./ChatQuiz";
import { CitationCard } from "./CitationCard";
import { EvidenceBadge } from "./EvidenceBadge";
import { FormattedAnswer } from "./FormattedAnswer";

interface ChatMessageProps {
  message: ChatMessageData;
  userInitials: string;
  activeChunkId: number | undefined;
  onSelectCitation: (citations: PolicyCitation[], index: number) => void;
  onContactHr: () => void;
  onRetry: (question: string) => void;
}

export function ChatMessage({ message, userInitials, activeChunkId, onSelectCitation, onContactHr, onRetry }: ChatMessageProps) {
  const { showToast } = useToast();

  if (message.role === "user") {
    return (
      <div className="flex animate-fade-up justify-end gap-3">
        <div className="max-w-[85%] sm:max-w-[70%]">
          <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary-600 px-4 py-2.5 text-[13.5px] leading-relaxed text-white shadow-[0_6px_16px_-10px_rgb(31_90_214/0.7)]">{message.content}</div>
          <p className="mt-1 text-right text-[11px] text-slate-400">{message.timestamp}</p>
        </div>
        <Avatar initials={userInitials} size="sm" />
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div role="alert" className="flex animate-fade-up gap-3">
        <AssistantMark size={32} />
        <div className="min-w-0 max-w-2xl flex-1 rounded-2xl rounded-tl-md border border-rose-200 bg-rose-50/70 px-4 py-3">
          <p className="flex items-start gap-2 text-[13px] text-rose-800">
            <CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <span className="block font-semibold">Couldn't get an answer</span>
              <span className="mt-0.5 block">{message.content}</span>
            </span>
          </p>
          {message.code !== "llm_not_configured" && (
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => onRetry(message.retryQuestion)}>
              <RefreshCw size={13} aria-hidden="true" />
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  const { response } = message;
  const citations = response.citations;
  const selectBySourceId = (sourceId: string) => {
    const index = citations.findIndex((c) => c.sourceId === sourceId);
    if (index >= 0) onSelectCitation(citations, index);
  };

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(response.answer);
      showToast("Answer copied to clipboard.");
    } catch {
      showToast("Couldn't copy automatically. Select the text to copy it.", "info");
    }
  };

  return (
    <div className="flex animate-fade-up gap-3">
      <AssistantMark size={32} />
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-navy-900">OnboardIQ Assistant</span>
          <EvidenceBadge evidence={response.evidence} />
          <span className="text-slate-400">{message.timestamp}</span>
        </p>
        <div className="max-w-2xl rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3.5 text-[13.5px] leading-relaxed text-slate-700 shadow-card">
          <FormattedAnswer
            text={response.answer}
            renderCitation={(sourceId, key) =>
              citations.some((c) => c.sourceId === sourceId) ? (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectBySourceId(sourceId)}
                  className="focus-ring mx-0.5 inline-flex h-[18px] -translate-y-px items-center rounded-md bg-primary-50 px-1.5 text-[10.5px] font-bold text-primary-700 ring-1 ring-inset ring-primary-200 transition-colors hover:bg-primary-600 hover:text-white hover:ring-primary-600"
                  aria-label={`Show source ${sourceId}`}
                >
                  {sourceId}
                </button>
              ) : null
            }
          />

          {response.escalation.recommended && (
            <div className="mt-3.5 flex flex-col gap-2.5 rounded-lg border border-amber-200 bg-amber-50/80 p-3 sm:flex-row sm:items-center">
              <p className="flex-1 text-xs leading-relaxed text-amber-900">
                <span className="font-semibold">Please confirm with HR.</span> {response.escalation.reason}
              </p>
              <Button variant="secondary" size="sm" onClick={onContactHr}>
                <LifeBuoy size={13} aria-hidden="true" />
                Contact HR
              </Button>
            </div>
          )}

          {citations.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="eyebrow mb-2 flex items-center gap-1.5 text-slate-500">
                Sources
                <span className="rounded-full bg-primary-50 px-1.5 text-[10px] font-bold text-primary-700">{citations.length}</span>
              </p>
              <ul className={`grid gap-2 ${citations.length > 1 ? "2xl:grid-cols-2" : ""}`}>
                {citations.map((citation, index) => (
                  <li key={citation.chunkId}>
                    <CitationCard citation={citation} active={citation.chunkId === activeChunkId} onSelect={() => onSelectCitation(citations, index)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-3 px-1 text-[11px] text-slate-400">
          {response.answeredFromDocuments && (
            <button type="button" onClick={copyAnswer} className="focus-ring inline-flex items-center gap-1 rounded font-medium hover:text-navy-900">
              <Copy size={11} aria-hidden="true" />
              Copy answer
            </button>
          )}
          {response.model && <span>AI-generated from company policies · {response.model}</span>}
        </div>
        {/* Only finished answers grounded in the policies get a quiz (never drafts, errors or the HR fallback). */}
        {response.answeredFromDocuments && citations.length > 0 && (
          <ChatQuiz
            chunkIds={citations.map((c) => c.chunkId)}
            onShowSource={(citation) => onSelectCitation([citation], 0)}
            onContinue={() => document.getElementById("policy-question")?.focus()}
          />
        )}
      </div>
    </div>
  );
}

/** Readable draft text: source markers like [S1] and the model's ESCALATE note are left for the validated answer. */
export function draftDisplayText(draft: string): string {
  return draft
    .replace(/\[S\d+\]/g, "")
    .replace(/(^|\n)[ \t]*escalate[ \t]*:[^\n]*/gi, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .trim();
}

/**
 * The answer while it is being written. It is a draft: when the model finishes, the server checks it against the
 * policy passages and the checked answer (with citations, or the HR fallback) replaces it.
 */
export function DraftAnswer({ draft }: { draft: string }) {
  const text = draftDisplayText(draft);
  return (
    <div className="flex animate-fade-in gap-3" data-testid="draft-answer">
      <AssistantMark size={32} />
      <div className="min-w-0 max-w-2xl flex-1">
        <div className="rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3.5 text-[13.5px] leading-relaxed text-slate-700 shadow-card">
          <p className="whitespace-pre-wrap break-words">
            {text}
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-primary-400 align-middle" aria-hidden="true" />
          </p>
        </div>
        <p className="mt-1 text-[11px] text-slate-400" role="status">
          Writing the answer… it will be checked against the policy, with sources, when it's complete.
        </p>
      </div>
    </div>
  );
}

/** Shown until the first words arrive: first while searching the policies, then while the model starts writing. */
export function TypingIndicator({ passages = null }: { passages?: number | null }) {
  const label =
    passages === null
      ? "Searching your company policies…"
      : `Found ${passages} relevant ${passages === 1 ? "passage" : "passages"} · writing your answer…`;
  return (
    <div className="flex animate-fade-in gap-3" role="status" aria-label={label}>
      <AssistantMark size={32} />
      <div className="flex items-center gap-3 rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3 shadow-card">
        <span className="flex gap-1" aria-hidden="true">
          {[0, 150, 300].map((delay) => (
            <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-400" style={{ animationDelay: `${delay}ms` }} />
          ))}
        </span>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
    </div>
  );
}
