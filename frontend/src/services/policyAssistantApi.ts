import type { AssistantStatus, ChatHistoryMessage, ChatResponse } from "../types/policyAssistant";
import { ApiError, apiRequest, apiStream } from "./apiClient";

const BASE_PATH = "/api/v1/policies";
// Blocking fallback: the whole answer must arrive within this time. Kept above the backend's default LLM budget
// (LLM_TIMEOUT_SECONDS) so the server, not the browser, reports a slow model and stops it.
const CHAT_TIMEOUT_MS = 200_000;
// Streaming: the longest wait for the next piece. The first piece comes right after retrieval; the model's first
// words can take a while on a CPU-only machine, and the server ends the stream itself at its LLM time budget.
const STREAM_IDLE_TIMEOUT_MS = 200_000;
/** Matches the backend limit; older turns are dropped before sending. */
export const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 4000;

function isChatResponse(value: unknown): value is ChatResponse {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  const evidence = data.evidence as Record<string, unknown> | undefined;
  const escalation = data.escalation as Record<string, unknown> | undefined;
  return (
    typeof data.answer === "string" &&
    Array.isArray(data.citations) &&
    data.citations.every((c) => c && typeof c === "object" && typeof (c as Record<string, unknown>).sourceId === "string") &&
    !!evidence &&
    typeof evidence.level === "string" &&
    !!escalation &&
    typeof escalation.recommended === "boolean"
  );
}

/**
 * Assistant readiness. `check` also tests the AI provider connection (cached server-side for 60 s);
 * `refresh` bypasses that cache (honoured for HR only).
 */
export async function fetchAssistantStatus(signal?: AbortSignal, { check = true, refresh = false }: { check?: boolean; refresh?: boolean } = {}): Promise<AssistantStatus> {
  const params = new URLSearchParams();
  if (check) params.set("check", "true");
  if (refresh) params.set("refresh", "true");
  const query = params.toString();
  const data = await apiRequest<AssistantStatus>(`${BASE_PATH}/assistant/status${query ? `?${query}` : ""}`, { signal }, { timeoutMs: 20_000 });
  if (typeof data?.llmConfigured !== "boolean") throw new ApiError("The server returned an unexpected status format.", null);
  return data;
}

export interface ChatRequest {
  question: string;
  history: ChatHistoryMessage[];
  documentId?: string;
}

function chatBody({ question, history, documentId }: ChatRequest) {
  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_CHARS) }));
  return { question, history: trimmedHistory, ...(documentId ? { documentId } : {}) };
}

export async function sendPolicyQuestion(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  const data = await apiRequest<unknown>(`${BASE_PATH}/chat`, { method: "POST", body: JSON.stringify(chatBody(request)), signal }, { timeoutMs: CHAT_TIMEOUT_MS });
  if (!isChatResponse(data)) throw new ApiError("The server returned an unexpected answer format.", null);
  return data;
}

/**
 * Asks a question and streams the reply: `onDraft` receives the text written so far (unvalidated, may contain
 * [S1]-style markers). Resolves with the validated answer, which must replace the draft; it can differ from it
 * (for example the HR fallback when the draft couldn't be tied to a policy passage). Falls back to the
 * non-streaming endpoint when the server has no streaming route.
 */
export async function streamPolicyQuestion(
  request: ChatRequest,
  onDraft: (draft: string) => void,
  signal?: AbortSignal,
  /** Called when retrieval has finished and the model starts writing, with the number of passages it was given. */
  onGenerating?: (passages: number) => void,
): Promise<ChatResponse> {
  let draft = "";
  // Set from inside the event callback (an object, so TypeScript doesn't narrow them to their initial null).
  const outcome: { final: ChatResponse | null; error: ApiError | null } = { final: null, error: null };
  try {
    await apiStream(
      `${BASE_PATH}/chat/stream`,
      chatBody(request),
      (event) => {
        if (event.type === "status" && event.stage === "generating") {
          onGenerating?.(typeof event.passages === "number" ? event.passages : 0);
        } else if (event.type === "token" && typeof event.text === "string") {
          draft += event.text;
          onDraft(draft);
        } else if (event.type === "done") {
          if (!isChatResponse(event.response)) throw new ApiError("The server returned an unexpected answer format.", null);
          outcome.final = event.response;
        } else if (event.type === "error") {
          outcome.error = new ApiError(
            typeof event.detail === "string" ? event.detail : "Something went wrong while answering. Please try again.",
            typeof event.status === "number" ? event.status : null,
            typeof event.code === "string" ? event.code : null,
          );
        }
      },
      { signal, idleTimeoutMs: STREAM_IDLE_TIMEOUT_MS },
    );
  } catch (error) {
    // An older server without the streaming route (or a browser without readable streams): ask the blocking way.
    if (error instanceof ApiError && (error.status === 404 || error.status === 405 || error.code === "stream_unsupported")) return sendPolicyQuestion(request, signal);
    throw error;
  }
  if (outcome.error) throw outcome.error;
  if (!outcome.final) throw new ApiError("The answer was cut off before it finished. Please try again.", null);
  return outcome.final;
}
