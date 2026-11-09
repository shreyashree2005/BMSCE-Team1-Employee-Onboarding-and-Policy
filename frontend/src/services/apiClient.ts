const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");
const DEFAULT_TIMEOUT_MS = 10_000;

/** Sent on every request; the API requires it for state-changing requests made with the session cookie (CSRF defence). */
export const CSRF_HEADER = { "X-Requested-With": "OnboardIQ" } as const;

/** Fired on window when an authenticated request gets 401, so the app can return to the sign-in page. */
export const UNAUTHORIZED_EVENT = "onboardiq:unauthorized";

/**
 * Error with a user-friendly message. `status` is null when the server could not be reached;
 * `code` is the backend's machine-readable error code (e.g. "llm_not_configured"), when provided.
 */
export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  /** Per-field messages for form validation errors (field name -> message). */
  readonly fields: Record<string, string>;

  constructor(message: string, status: number | null, code: string | null = null, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function readFields(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/** "confirmPassword" → "confirm password". */
export function fieldLabel(field: string): string {
  return field.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/** Pydantic's built-in messages say nothing about which field they belong to; reword them for people. */
function readableMessage(message: string): string {
  const text = message.replace(/^Value error,\s*/, "");
  if (text === "Field required") return "This field is required.";
  if (text === "Extra inputs are not permitted") return "The server doesn't accept this field.";
  return text;
}

/**
 * Every FastAPI validation error, keyed by the request field it belongs to (`fields`), plus one summary message.
 * Errors that aren't tied to a field (e.g. "Passwords don't match") are kept as messages. A bare "Field required"
 * is never returned on its own: field errors are always named in the summary.
 */
function readValidationErrors(items: unknown[]): { detail: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const general: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const { loc, msg } = item as { loc?: unknown; msg?: unknown };
    if (typeof msg !== "string") continue;
    const path = Array.isArray(loc) ? loc.filter((part): part is string => typeof part === "string" && part !== "body") : [];
    const field = path[path.length - 1];
    if (field) fields[field] ??= readableMessage(msg);
    else general.push(readableMessage(msg));
  }
  const named = Object.entries(fields).map(([field, message]) => `${fieldLabel(field)}: ${message.replace(/\.$/, "")}`);
  const detail = general[0] ?? (named.length ? `Please check these details: ${named.join("; ")}.` : "The request couldn't be validated.");
  return { detail, fields };
}

async function readErrorBody(response: Response): Promise<{ detail?: string; code: string | null; fields?: Record<string, string> }> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      const { detail, code, fields } = body as { detail?: unknown; code?: unknown; fields?: unknown };
      const errorCode = typeof code === "string" ? code : null;
      if (typeof detail === "string") return { detail, code: errorCode, fields: readFields(fields) };
      // FastAPI validation errors: [{ loc: ["body", "field"], msg: "..." }, ...]
      if (Array.isArray(detail) && typeof detail[0]?.msg === "string") return { ...readValidationErrors(detail), code: errorCode };
      return { code: errorCode };
    }
  } catch {
    // Non-JSON error body; fall back to a generic message.
  }
  return { code: null };
}

export interface ApiRequestOptions {
  /** Defaults to 10 s. Use longer timeouts for requests that may load the embedding model. */
  timeoutMs?: number;
  /** Don't announce a 401 as an expired session (sign-in and the startup session check handle 401 themselves). */
  skipUnauthorizedEvent?: boolean;
}

/**
 * Request to the OnboardIQ API. Sends JSON bodies as JSON and FormData as multipart, with the session cookie.
 * Rejects with ApiError on network failure, timeout or a non-2xx response; resolves
 * to undefined for 204 No Content. Aborting via `init.signal` rethrows the AbortError.
 */
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  { timeoutMs = DEFAULT_TIMEOUT_MS, skipUnauthorizedEvent = false }: ApiRequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  init.signal?.addEventListener("abort", forwardAbort);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      // The session lives in an httpOnly cookie that scripts can't read; the browser attaches it.
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...CSRF_HEADER,
        // For FormData the browser sets the multipart Content-Type (with boundary) itself.
        ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    if (timedOut) throw new ApiError("The OnboardIQ server took too long to respond. Please try again.", null);
    throw new ApiError("Can't reach the OnboardIQ server. Check that the backend is running and try again.", null);
  } finally {
    window.clearTimeout(timer);
    init.signal?.removeEventListener("abort", forwardAbort);
  }

  if (!response.ok) {
    const { detail, code, fields } = await readErrorBody(response);
    if (response.status === 401 && !skipUnauthorizedEvent) window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    throw new ApiError(detail ?? `The request failed (HTTP ${response.status}).`, response.status, code, fields);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * POSTs JSON and reads a newline-delimited JSON stream, calling `onEvent` for each event as it arrives.
 * `idleTimeoutMs` limits the wait for the next piece of data (not the whole answer, which may take a while).
 * Non-2xx responses reject with ApiError before any event; aborting via `signal` rethrows the AbortError.
 */
export async function apiStream(
  path: string,
  body: unknown,
  onEvent: (event: Record<string, unknown>) => void,
  { signal, idleTimeoutMs }: { signal?: AbortSignal; idleTimeoutMs: number },
): Promise<void> {
  const controller = new AbortController();
  let timedOut = false;
  let timer = 0;
  const resetTimer = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, idleTimeoutMs);
  };
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort);
  const failure = (error: unknown): never => {
    if (signal?.aborted) throw error;
    if (timedOut) throw new ApiError("The OnboardIQ server took too long to respond. Please try again.", null);
    if (error instanceof ApiError) throw error;
    throw new ApiError("Can't reach the OnboardIQ server. Check that the backend is running and try again.", null);
  };

  try {
    resetTimer();
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/x-ndjson", "Content-Type": "application/json", ...CSRF_HEADER },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      return failure(error);
    }
    if (!response.ok) {
      const { detail, code, fields } = await readErrorBody(response);
      if (response.status === 401) window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      throw new ApiError(detail ?? `The request failed (HTTP ${response.status}).`, response.status, code, fields);
    }
    if (!response.body) throw new ApiError("The server didn't return a readable stream.", response.status, "stream_unsupported");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    const emit = (line: string) => {
      if (!line.trim()) return;
      let event: unknown;
      try {
        event = JSON.parse(line);
      } catch {
        throw new ApiError("The server returned an unexpected answer format.", null);
      }
      if (event && typeof event === "object") onEvent(event as Record<string, unknown>);
    };
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        return failure(error);
      }
      if (chunk.done) break;
      resetTimer();
      buffered += decoder.decode(chunk.value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      lines.forEach(emit);
    }
    emit(buffered + decoder.decode());
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

/** Downloads a file with the session cookie (for opening protected files in the browser). */
export async function apiBlob(path: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", headers: { ...CSRF_HEADER } });
  } catch {
    throw new ApiError("Can't reach the OnboardIQ server. Check that the backend is running and try again.", null);
  }
  if (!response.ok) {
    const { detail, code } = await readErrorBody(response);
    if (response.status === 401) window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    throw new ApiError(detail ?? `The file couldn't be loaded (HTTP ${response.status}).`, response.status, code);
  }
  return response.blob();
}
