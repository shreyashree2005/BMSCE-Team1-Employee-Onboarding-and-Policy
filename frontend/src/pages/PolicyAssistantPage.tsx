import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { RotateCcw } from "lucide-react";
import { AssistantStatusBanner, availabilityBadge, availabilityFromStatus, type AssistantAvailability } from "../components/policy/AssistantStatusBanner";
import { ChatComposer } from "../components/policy/ChatComposer";
import { ChatMessage, DraftAnswer, TypingIndicator } from "../components/policy/ChatMessage";
import { CitationPanel } from "../components/policy/CitationPanel";
import { KnowledgeRail } from "../components/policy/KnowledgeRail";
import { PolicyWelcome } from "../components/policy/PolicyWelcome";
import { ContactHrModal } from "../components/support/ContactHrModal";
import { AssistantMark } from "../components/ui/AssistantMark";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { useCurrentUser, useProfile } from "../context/AuthContext";
import { suggestedQuestions } from "../data/mockPolicyAssistant";
import { ApiError } from "../services/apiClient";
import { fetchPolicyDocuments } from "../services/policyDocumentsApi";
import { fetchAssistantStatus, streamPolicyQuestion } from "../services/policyAssistantApi";
import type { AssistantStatus, ChatHistoryMessage, ChatMessage as ChatMessageData, PolicyCategory, PolicyCitation } from "../types/policyAssistant";
import type { PolicyDocument } from "../types/policyDocuments";
import { getInitials } from "../utils/format";

interface CitationSelection {
  citations: PolicyCitation[];
  index: number;
}

function currentTime(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Prior turns sent as context. Error bubbles are excluded; the backend never treats this as evidence. */
function toHistory(messages: ChatMessageData[]): ChatHistoryMessage[] {
  return messages.flatMap((m): ChatHistoryMessage[] =>
    m.role === "user" ? [{ role: "user", content: m.content }] : m.role === "assistant" ? [{ role: "assistant", content: m.content }] : [],
  );
}

export function PolicyAssistantPage() {
  const currentEmployee = useProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [pending, setPending] = useState(false);
  // The answer as it is being written (streamed); replaced by the validated answer when it completes.
  const [draft, setDraft] = useState<string | null>(null);
  // Passages found once retrieval is done (null while still searching), for the loading indicator.
  const [foundPassages, setFoundPassages] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [category, setCategory] = useState<PolicyCategory | "All">("All");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [citation, setCitation] = useState<CitationSelection | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [availability, setAvailability] = useState<AssistantAvailability>("loading");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusCheck, setStatusCheck] = useState({ count: 0, refresh: false });
  const [checking, setChecking] = useState(false);
  const isHr = useCurrentUser().role === "hr";
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const handledLocationKey = useRef<string | null>(null);

  // Status (incl. a live provider check) and documents decide whether the assistant can answer.
  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    Promise.all([fetchAssistantStatus(controller.signal, { check: true, refresh: statusCheck.refresh }), fetchPolicyDocuments(controller.signal)])
      .then(([loadedStatus, loadedDocuments]) => {
        setStatus(loadedStatus);
        setDocuments(loadedDocuments);
        setStatusMessage(null);
        setAvailability(availabilityFromStatus(loadedStatus));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatusMessage(error instanceof ApiError ? error.message : null);
        setAvailability("backend_unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [statusCheck]);

  // While documents are being indexed, check again every few seconds.
  useEffect(() => {
    if (availability !== "indexing") return;
    const timer = window.setTimeout(() => setStatusCheck((s) => ({ count: s.count + 1, refresh: false })), 4000);
    return () => window.clearTimeout(timer);
  }, [availability, status]);

  useEffect(() => () => requestRef.current?.abort(), []);

  // "Check again" re-tests the provider immediately (the server honours refresh for HR only).
  const recheckStatus = useCallback(() => setStatusCheck((s) => ({ count: s.count + 1, refresh: true })), []);
  const canAsk = availability === "ready" && !pending;

  const ask = useCallback(
    async (question: string, { retry = false }: { retry?: boolean } = {}) => {
      const text = question.trim();
      if (text.length < 2 || pending || availability !== "ready") return;

      // On retry the question is already the last user turn, so it isn't repeated in the history.
      const history = toHistory(messages);
      const historyToSend = retry ? history.slice(0, -1) : history;
      setMessages((prev) =>
        retry
          ? prev.filter((m) => !(m.role === "error" && m.retryQuestion === text))
          : [...prev, { id: `m${nextId.current++}`, role: "user", content: text, timestamp: currentTime() }],
      );
      setInput("");
      setPending(true);
      const controller = new AbortController();
      requestRef.current = controller;

      try {
        const response = await streamPolicyQuestion(
          { question: text, history: historyToSend, documentId: documentId ?? undefined },
          (partial) => {
            if (!controller.signal.aborted) setDraft(partial);
          },
          controller.signal,
          (passages) => {
            if (!controller.signal.aborted) setFoundPassages(passages);
          },
        );
        setMessages((prev) => [...prev, { id: `m${nextId.current++}`, role: "assistant", content: response.answer, timestamp: currentTime(), response }]);
        setCitation(response.citations.length ? { citations: response.citations, index: 0 } : null);
      } catch (error) {
        if (controller.signal.aborted) return;
        const apiError = error instanceof ApiError ? error : null;
        if (apiError?.code === "llm_not_configured") setAvailability("llm_not_configured");
        // Provider failures mid-chat: re-run the status check so the banner explains what's wrong.
        if (apiError?.code === "llm_auth_failed" || apiError?.code === "llm_unavailable") recheckStatus();
        setMessages((prev) => [
          ...prev,
          {
            id: `m${nextId.current++}`,
            role: "error",
            content: apiError?.message ?? "Something went wrong while answering. Please try again.",
            timestamp: currentTime(),
            code: apiError?.code ?? null,
            retryQuestion: text,
          },
        ]);
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
        setDraft(null);
        setFoundPassages(null);
        setPending(false);
      }
    },
    [availability, documentId, messages, pending, recheckStatus],
  );

  // Links can carry ?q=… (pre-fill) or ?q=…&ask=1 (ask once the assistant is ready). Each navigation is handled once.
  useEffect(() => {
    const question = searchParams.get("q");
    if (!question || availability === "loading" || handledLocationKey.current === location.key) return;
    handledLocationKey.current = location.key;
    if (searchParams.get("ask") === "1" && availability === "ready") void ask(question);
    else setInput(question);
    setSearchParams({}, { replace: true });
  }, [location.key, availability, searchParams, setSearchParams, ask]);

  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, pending, draft]);

  const resetConversation = () => {
    requestRef.current?.abort();
    setMessages([]);
    setPending(false);
    setCitation(null);
    setInput("");
  };

  const asked = new Set(messages.filter((m) => m.role === "user").map((m) => m.content));
  const followUps = (category === "All" ? suggestedQuestions : suggestedQuestions.filter((q) => q.category === category))
    .filter((q) => !asked.has(q.question))
    .slice(0, 3);
  const hasConversation = messages.length > 0;
  const activeChunkId = citation?.citations[citation.index]?.chunkId;
  const filteredDocument = documents.find((d) => d.id === documentId);
  const composerPlaceholder =
    availability === "llm_not_configured"
      ? "The assistant isn't configured yet"
      : availability === "provider_unreachable"
        ? "The AI provider is unavailable right now"
        : availability === "retrieval_unavailable"
          ? "Policy search is unavailable right now"
          : availability === "indexing"
            ? "Policies are being indexed…"
            : availability === "no_documents"
              ? isHr
                ? "Upload a policy document to start asking questions"
                : "No policies have been published yet"
              : filteredDocument
                ? `Ask about ${filteredDocument.filename}…`
                : "Ask about leave, benefits, payroll, onboarding…";
  const readyCount = status?.readyDocuments ?? 0;
  const badge = availabilityBadge(availability, status);
  const badgeTones = {
    green: ["bg-emerald-50 text-emerald-700 ring-emerald-100", "bg-emerald-500"],
    amber: ["bg-amber-50 text-amber-800 ring-amber-100", "bg-amber-500"],
    rose: ["bg-rose-50 text-rose-700 ring-rose-100", "bg-rose-500"],
    gray: ["bg-slate-50 text-slate-600 ring-slate-200", "bg-slate-400"],
  } as const;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Knowledge assistant"
        title="Policy Assistant"
        description="Ask policy questions in plain language. Answers come only from your uploaded company policies, with every source cited."
        badge={
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${badgeTones[badge.tone][0]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${badgeTones[badge.tone][1]}`} aria-hidden="true" />
            {badge.label}
          </span>
        }
      />

      <AssistantStatusBanner availability={availability} status={status} isHr={isHr} message={statusMessage} checking={checking} onRetry={recheckStatus} />

      <div className="grid h-[78dvh] min-h-[520px] overflow-hidden lg:h-[calc(100vh-15.5rem)] lg:min-h-[580px] rounded-panel border border-line bg-white shadow-card lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[240px_minmax(0,1fr)_340px]">
        <div className="hidden min-h-0 xl:flex">
          <KnowledgeRail category={category} onCategoryChange={setCategory} documents={documents} documentId={documentId} onDocumentChange={setDocumentId} />
        </div>

        <section aria-label="Conversation" className="flex min-h-0 flex-col">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
            <AssistantMark size={32} />
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-navy-900">OnboardIQ Assistant</p>
              <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${availability === "ready" ? "bg-emerald-500" : "bg-slate-300"}`} aria-hidden="true" />
                {availability === "ready"
                  ? filteredDocument
                    ? `Answering from ${filteredDocument.filename}`
                    : `Answering from ${readyCount} uploaded ${readyCount === 1 ? "policy" : "policies"}`
                  : availability === "loading"
                    ? "Connecting…"
                    : "Unavailable"}
              </p>
            </div>
            <Button variant="secondary" size="sm" className="ml-auto" onClick={resetConversation} disabled={!hasConversation && !pending}>
              <RotateCcw size={13} aria-hidden="true" />
              New chat
            </Button>
          </div>

          <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#f8fafd_0%,#ffffff_220px)] px-4 py-6 sm:px-6" aria-live="polite">
            {!hasConversation ? (
              <PolicyWelcome
                firstName={currentEmployee.firstName}
                category={category}
                onCategoryChange={setCategory}
                onAsk={(q) => void ask(q)}
                disabled={availability !== "ready"}
              />
            ) : (
              <div className="mx-auto max-w-3xl space-y-6">
                {messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    userInitials={getInitials(currentEmployee.firstName, currentEmployee.lastName)}
                    activeChunkId={activeChunkId}
                    onSelectCitation={(citations, index) => setCitation({ citations, index })}
                    onContactHr={() => setContactOpen(true)}
                    onRetry={(question) => void ask(question, { retry: true })}
                  />
                ))}
                {pending && (draft ? <DraftAnswer draft={draft} /> : <TypingIndicator passages={foundPassages} />)}
              </div>
            )}
          </div>

          {hasConversation && followUps.length > 0 && availability === "ready" && (
            <div className="scrollbar-none flex gap-2 overflow-x-auto border-t border-line px-4 pt-3 sm:px-6" role="group" aria-label="Suggested follow-up questions">
              {followUps.map(({ question }) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void ask(question)}
                  disabled={!canAsk}
                  className="focus-ring shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-primary-200 hover:text-primary-700 disabled:opacity-50"
                >
                  {question}
                </button>
              ))}
            </div>
          )}
          <ChatComposer value={input} onChange={setInput} onSend={() => void ask(input)} disabled={!canAsk} placeholder={composerPlaceholder} />
        </section>

        <div className="hidden min-h-0 lg:flex lg:flex-col">
          <CitationPanel
            citations={citation?.citations ?? []}
            activeIndex={citation?.index ?? 0}
            loading={pending}
            onSelect={(index) => setCitation((prev) => (prev ? { ...prev, index } : prev))}
          />
        </div>
      </div>

      <ContactHrModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  );
}
