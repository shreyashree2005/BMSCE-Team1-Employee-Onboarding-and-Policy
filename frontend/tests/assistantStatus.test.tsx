/** Policy Assistant readiness states (MOCKED API: these tests don't contact any AI provider). */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { AssistantStatus } from "../src/types/policyAssistant";
import { employeeUser, hrUser, mockApi, renderApp, signedInRoutes } from "./helpers";

const readyDocument = { id: "d1", filename: "leave-policy.pdf", fileType: "pdf", sizeBytes: 1200, status: "ready", pageCount: 3, chunkCount: 6, errorMessage: null, uploadedAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z" };

function status(overrides: Partial<AssistantStatus> & { connection?: string; message?: string | null; knowledgeMessage?: string | null; processing?: number } = {}): AssistantStatus {
  const { connection = "connected", message = "Connected to localhost:11434; model 'qwen2.5-coder:3b' is available.", knowledgeMessage = null, processing = 0, ...rest } = overrides;
  return {
    llmConfigured: true,
    llmModel: "qwen2.5-coder:3b",
    embeddingModel: "sentence-transformers/all-MiniLM-L6-v2",
    readyDocuments: 1,
    state: "ready",
    provider: { configured: true, model: "qwen2.5-coder:3b", host: "localhost:11434", connection: connection as never, message, checkedAt: "2026-11-07T12:00:00Z" },
    knowledge: { totalDocuments: 1, readyDocuments: 1, processingDocuments: processing, failedDocuments: 0, indexedPassages: 6, expectedPassages: 6, retrievalAvailable: knowledgeMessage === null, message: knowledgeMessage },
    ...rest,
  };
}

function setup(user: typeof hrUser, assistantStatus: AssistantStatus | (() => AssistantStatus), documents: unknown[] = [readyDocument]) {
  return mockApi({
    ...signedInRoutes(user),
    "GET /api/v1/policies/assistant/status": () => ({ body: typeof assistantStatus === "function" ? assistantStatus() : assistantStatus }),
    "GET /api/v1/policies/documents": () => ({ body: documents }),
  });
}

describe("Policy Assistant status", () => {
  it("requests a live provider check and is ready when everything works", async () => {
    const { requests } = setup(hrUser, status());
    renderApp("/policy-assistant");

    expect(await screen.findByText("AI · qwen2.5-coder:3b")).toBeInTheDocument();
    expect(screen.getByText("Answering from 1 uploaded policy")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Ask about leave/)).not.toBeDisabled();
    expect(requests.find((r) => r.path === "/api/v1/policies/assistant/status")?.search).toContain("check=true");
  });

  it("tells HR exactly which settings to add when no provider is configured", async () => {
    setup(hrUser, status({ state: "not_configured", llmConfigured: false, connection: "not_configured" }));
    renderApp("/policy-assistant");

    expect(await screen.findByText("AI provider not configured")).toBeInTheDocument();
    expect(screen.getByText("LLM_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("backend/.env")).toBeInTheDocument();
  });

  it("gives employees plain guidance instead of server configuration", async () => {
    setup(employeeUser, status({ state: "not_configured", llmConfigured: false, connection: "not_configured" }));
    renderApp("/policy-assistant");

    expect(await screen.findByText("AI provider not configured")).toBeInTheDocument();
    expect(screen.getByText(/Your HR team needs to finish setting it up/)).toBeInTheDocument();
    expect(screen.queryByText("LLM_API_KEY")).not.toBeInTheDocument();
  });

  it("shows the provider's connection error to HR and offers a re-check", async () => {
    let current = status({ state: "provider_unreachable", connection: "unreachable", message: "Couldn't connect to localhost:11434. Check LLM_BASE_URL and that the service is running." });
    const { requests } = setup(hrUser, () => current);
    renderApp("/policy-assistant");

    expect(await screen.findByText("Can't connect to the AI provider")).toBeInTheDocument();
    expect(screen.getByText(/Couldn't connect to localhost:11434/)).toBeInTheDocument();
    expect(screen.getByText("AI provider offline")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("The AI provider is unavailable right now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send question" })).toBeDisabled();

    current = status();
    await userEvent.setup().click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(screen.queryByText("Can't connect to the AI provider")).not.toBeInTheDocument());
    expect(requests.filter((r) => r.path === "/api/v1/policies/assistant/status").at(-1)?.search).toContain("refresh=true");
  });

  it("asks HR to upload when no policies are indexed", async () => {
    setup(hrUser, status({ state: "no_documents", readyDocuments: 0 }), []);
    renderApp("/policy-assistant");

    expect(await screen.findByText("No policies uploaded yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload policies" })).toHaveAttribute("href", "/documents");
    expect(screen.getByText("No policies indexed yet. Upload one to enable answers.")).toBeInTheDocument();
  });

  it("doesn't ask employees to upload policies", async () => {
    setup(employeeUser, status({ state: "no_documents", readyDocuments: 0 }), []);
    renderApp("/policy-assistant");

    expect(await screen.findByText("No policies uploaded yet")).toBeInTheDocument();
    expect(screen.getByText(/none have been published yet/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Upload policies" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse policy library" })).toBeInTheDocument();
  });

  it("shows indexing progress and refreshes until ready", async () => {
    let calls = 0;
    setup(hrUser, () => (++calls === 1 ? status({ state: "indexing", processing: 1 }) : status()));
    renderApp("/policy-assistant");

    expect(await screen.findByText("Indexing policy documents")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("AI · qwen2.5-coder:3b")).toBeInTheDocument(), { timeout: 8000 });
  });

  it("explains when retrieval is unavailable", async () => {
    setup(hrUser, status({ state: "retrieval_unavailable", knowledgeMessage: "The search index on this server has 0 passages but the database has 6. Restart the API (run only one instance) to rebuild the index." }));
    renderApp("/policy-assistant");

    expect(await screen.findByText("Policy search is unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Restart the API \(run only one instance\)/)).toBeInTheDocument();
  });
});
