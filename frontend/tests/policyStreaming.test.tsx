/** Streamed Policy Assistant answers (MOCKED API: no AI provider is contacted). Answers and policies are fictional. */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { AssistantStatus, ChatResponse } from "../src/types/policyAssistant";
import { employeeUser, mockApi, ndjson, renderApp, signedInRoutes } from "./helpers";

const readyStatus: AssistantStatus = {
  llmConfigured: true,
  llmModel: "qwen2.5-coder:3b",
  embeddingModel: "sentence-transformers/all-MiniLM-L6-v2",
  readyDocuments: 1,
  state: "ready",
  provider: { configured: true, model: "qwen2.5-coder:3b", host: "localhost:11434", connection: "connected", message: "Connected.", checkedAt: "2026-11-07T12:00:00Z" },
  knowledge: { totalDocuments: 1, readyDocuments: 1, processingDocuments: 0, failedDocuments: 0, indexedPassages: 6, expectedPassages: 6, retrievalAvailable: true, message: null },
};
const readyDocument = { id: "d1", filename: "leave-policy.pdf", fileType: "pdf", sizeBytes: 1200, status: "ready", pageCount: 3, chunkCount: 6, errorMessage: null, uploadedAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z" };

const answer: ChatResponse = {
  answer: "Employees receive 18 days of paid annual leave each year [S1].",
  citations: [{ sourceId: "S1", chunkId: 11, documentId: "d1", documentName: "leave-policy.pdf", pageNumber: 2, section: "3. Annual leave", excerpt: "Employees receive 18 days of paid annual leave each year.", score: 0.71 }],
  evidence: { level: "strong", topScore: 0.71, supportingPassages: 2, explanation: "Closely matching policy text found (2 passages)." },
  escalation: { recommended: false, reason: null },
  answeredFromDocuments: true,
  model: "qwen2.5-coder:3b",
};
const fallback: ChatResponse = {
  answer: "I couldn't find enough information in the available company policies to answer this question. Please contact HR for clarification.",
  citations: [],
  evidence: { level: "insufficient", topScore: 0.42, supportingPassages: 0, explanation: "The answer couldn't be tied to a specific policy passage." },
  escalation: { recommended: true, reason: "The answer couldn't be tied to a specific policy passage." },
  answeredFromDocuments: false,
  model: null,
};

/** A stream whose events are pushed by the test, to observe the page between them. */
function controlledStream() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  return {
    response: new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson" } }),
    push: (event: unknown) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")),
    close: () => controller.close(),
  };
}

function setup(stream: () => { status?: number; body?: unknown; raw?: Response }, extra: Record<string, () => { status?: number; body?: unknown }> = {}) {
  return mockApi({
    ...signedInRoutes(employeeUser),
    "GET /api/v1/policies/assistant/status": () => ({ body: readyStatus }),
    "GET /api/v1/policies/documents": () => ({ body: [readyDocument] }),
    "POST /api/v1/policies/chat/stream": stream,
    ...extra,
  });
}

async function askQuestion(question = "How many days of annual leave do I get?") {
  const user = userEvent.setup();
  const input = await screen.findByPlaceholderText(/Ask about leave/);
  await waitFor(() => expect(input).not.toBeDisabled());
  await user.type(input, question);
  await user.click(screen.getByRole("button", { name: "Send question" }));
}

describe("Policy Assistant streaming", () => {
  it("shows the answer while it's written, then replaces the draft with the checked answer and its sources", async () => {
    const stream = controlledStream();
    const { requests } = setup(() => ({ raw: stream.response }));
    renderApp("/policy-assistant");
    await askQuestion();

    // Loading shows the real stage: searching first, then the number of passages found once retrieval is done.
    expect(await screen.findByText("Searching your company policies…")).toBeInTheDocument();
    stream.push({ type: "status", stage: "generating", passages: 2 });
    expect(await screen.findByText("Found 2 relevant passages · writing your answer…")).toBeInTheDocument();
    stream.push({ type: "token", text: "Employees receive 18 days " });
    const draft = await screen.findByTestId("draft-answer");
    expect(draft).toHaveTextContent("Employees receive 18 days");
    stream.push({ type: "token", text: "of paid annual leave each year [S1]." });
    // Source markers are kept for the checked answer; the draft reads as plain text.
    await waitFor(() => expect(draft).toHaveTextContent("Employees receive 18 days of paid annual leave each year."));
    expect(draft).not.toHaveTextContent("[S1]");
    expect(within(draft).getByRole("status")).toHaveTextContent(/checked against the policy/);

    stream.push({ type: "done", response: answer });
    stream.close();
    expect(await screen.findByRole("button", { name: "Show source S1" })).toBeInTheDocument();
    expect(screen.queryByTestId("draft-answer")).not.toBeInTheDocument();
    expect(screen.queryByText(/Searching your company policies|writing your answer…/)).not.toBeInTheDocument();

    const sent = requests.find((r) => r.path === "/api/v1/policies/chat/stream");
    expect(sent?.body).toEqual({ question: "How many days of annual leave do I get?", history: [] });
    expect(sent?.headers["x-requested-with"]).toBe("OnboardIQ");
  });

  it("replaces a draft the server couldn't verify with the HR fallback", async () => {
    setup(() => ({
      raw: ndjson([
        { type: "status", stage: "generating", passages: 1 },
        { type: "token", text: "Employees get unlimited holidays." },
        { type: "done", response: fallback },
      ]),
    }));
    renderApp("/policy-assistant");
    await askQuestion();

    expect(await screen.findByText(/couldn't find enough information in the available company policies/)).toBeInTheDocument();
    expect(screen.queryByText("Employees get unlimited holidays.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Contact HR/ })).toBeInTheDocument();
  });

  it("shows the server's error when generation fails part-way, with a retry", async () => {
    setup(() => ({
      raw: ndjson([
        { type: "status", stage: "generating", passages: 1 },
        { type: "token", text: "Employees receive" },
        { type: "error", status: 504, code: "llm_timeout", detail: "The AI service took too long to respond. Please try again." },
      ]),
    }));
    renderApp("/policy-assistant");
    await askQuestion();

    expect(await screen.findByText("The AI service took too long to respond. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again|Retry/ })).toBeInTheDocument();
    expect(screen.queryByTestId("draft-answer")).not.toBeInTheDocument();
  });

  it("reports an answer that stops before it finishes", async () => {
    setup(() => ({ raw: ndjson([{ type: "status", stage: "generating", passages: 1 }, { type: "token", text: "Employees" }]) }));
    renderApp("/policy-assistant");
    await askQuestion();
    expect(await screen.findByText("The answer was cut off before it finished. Please try again.")).toBeInTheDocument();
  });

  it("falls back to the regular endpoint when the server has no streaming route", async () => {
    const { requests } = setup(() => ({ status: 404, body: { detail: "Not Found" } }), { "POST /api/v1/policies/chat": () => ({ body: answer }) });
    renderApp("/policy-assistant");
    await askQuestion();

    expect(await screen.findByRole("button", { name: "Show source S1" })).toBeInTheDocument();
    expect(requests.map((r) => r.path)).toEqual(expect.arrayContaining(["/api/v1/policies/chat/stream", "/api/v1/policies/chat"]));
  });

  it("shows errors returned before streaming starts, such as an unconfigured assistant", async () => {
    setup(() => ({ status: 503, body: { detail: "The Policy Assistant isn't configured yet.", code: "llm_not_configured" } }));
    renderApp("/policy-assistant");
    await askQuestion();
    expect(await screen.findAllByText(/isn't configured/)).not.toHaveLength(0);
  });
});
