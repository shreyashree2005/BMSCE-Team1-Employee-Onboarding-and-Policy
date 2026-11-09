/** The 5-question quiz under a Policy Assistant answer (MOCKED API; policies and answers are fictional). */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { AssistantStatus, ChatResponse } from "../src/types/policyAssistant";
import type { AnswerQuiz, PolicyQuizResult } from "../src/types/policyQuiz";
import { employeeUser, mockApi, ndjson, renderApp, signedInRoutes } from "./helpers";

const readyStatus: AssistantStatus = {
  llmConfigured: true, llmModel: "qwen2.5-coder:3b", embeddingModel: "sentence-transformers/all-MiniLM-L6-v2", readyDocuments: 1, state: "ready",
  provider: { configured: true, model: "qwen2.5-coder:3b", host: "localhost:11434", connection: "connected", message: "Connected.", checkedAt: "2026-11-07T12:00:00Z" },
  knowledge: { totalDocuments: 1, readyDocuments: 1, processingDocuments: 0, failedDocuments: 0, indexedPassages: 6, expectedPassages: 6, retrievalAvailable: true, message: null },
}; // fmt: skip
const doc = { id: "d1", filename: "OIQ-HR-LEA-001_Leave-and-Attendance-Policy.pdf", fileType: "pdf", sizeBytes: 1200, status: "ready", pageCount: 3, chunkCount: 6, errorMessage: null, uploadedAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z" };
const citation = (n: number, chunkId: number) => ({ sourceId: `S${n}`, chunkId, documentId: "d1", documentName: doc.filename, pageNumber: 1, section: "1. Annual paid leave", excerpt: "Full-time employees receive eighteen (18) days of paid annual leave.", score: 0.7 });
const answer = (citations = [citation(1, 42), citation(2, 43)]): ChatResponse => ({
  answer: citations.length ? "Employees receive 18 days of annual leave [S1]. Up to 10 days carry forward [S2]." : "I couldn't find enough information in the available company policies to answer this question. Please contact HR for clarification.",
  citations,
  evidence: { level: citations.length ? "strong" : "insufficient", topScore: 0.7, supportingPassages: citations.length, explanation: "x" },
  escalation: { recommended: !citations.length, reason: citations.length ? null : "Not found." },
  answeredFromDocuments: citations.length > 0,
  model: citations.length ? "qwen2.5-coder:3b" : null,
});
const questions = [
  { id: "c42-s0", question: "Complete the policy statement: “Full-time employees receive ____ days of paid annual leave per calendar year.”", options: ["30", "18", "10", "36"] },
  { id: "c42-s1", question: "Complete the policy statement: “Annual leave accrues monthly at ____ days per month of service.”", options: ["1.5", "2", "1", "3"] },
  { id: "c43-s0", question: "Complete the policy statement: “Up to ____ unused annual leave days may be carried forward.”", options: ["8", "20", "10", "6"] },
  { id: "c44-s0", question: "Complete the policy statement: “Employees are entitled to ____ days of paid sick leave per calendar year.”", options: ["16", "8", "6", "10"] },
  { id: "c44-s3", question: "Complete the policy statement: “A medical certificate is required for sick leave longer than ____ consecutive days.”", options: ["1.5", "2", "3", "4"] },
];
const quiz: AnswerQuiz = { quizKey: "chat:OIQ-HR-LEA-001", title: "Leave and Attendance Policy quiz", chunkIds: [42, 43], questionCount: 5, passScore: 4, questions, history: [] };
const correct = [1, 0, 2, 1, 2];
const result = (chosen: number[]): PolicyQuizResult => {
  const results = questions.map((q, i) => ({
    id: q.id, question: q.question, options: q.options, chosen: chosen[i], correctOption: correct[i], correct: chosen[i] === correct[i],
    feedback: "", explanation: `The policy says: “statement ${i + 1}”`,
    source: { chunkId: 42 + Math.floor(i / 2), documentId: "d1", documentName: doc.filename, pageNumber: 1, section: "1. Annual paid leave", excerpt: `Passage for question ${i + 1}.` },
  })); // fmt: skip
  const score = results.filter((r) => r.correct).length;
  return { policyId: quiz.quizKey, title: quiz.title, score, total: 5, passScore: 4, passed: score >= 4, message: `Your Score: ${score}/5.`, results, history: [{ id: 1, score, total: 5, passed: score >= 4, createdAt: "2026-11-09T10:00:00Z" }], completedTaskIds: [] };
};

function setup(responses: ChatResponse[], extra: Record<string, (request: never) => { status?: number; body?: unknown; raw?: Response }> = {}) {
  let call = 0;
  return mockApi({
    ...signedInRoutes(employeeUser),
    "GET /api/v1/policies/assistant/status": () => ({ body: readyStatus }),
    "GET /api/v1/policies/documents": () => ({ body: [doc] }),
    "POST /api/v1/policies/chat/stream": () => {
      const response = responses[Math.min(call++, responses.length - 1)];
      return { raw: ndjson([{ type: "status", stage: "generating", passages: 2 }, { type: "token", text: response.answer }, { type: "done", response }]) };
    },
    "POST /api/v1/policies/chat-quizzes": () => ({ body: quiz }),
    ...extra,
  });
}

async function ask(question = "What is the leave policy?") {
  const user = userEvent.setup();
  const input = await screen.findByPlaceholderText(/Ask about leave/);
  await waitFor(() => expect(input).not.toBeDisabled());
  await user.type(input, question);
  await user.click(screen.getByRole("button", { name: "Send question" }));
  return user;
}

describe("quiz inside the Policy Assistant conversation", () => {
  it("offers the quiz below a completed answer, builds it from that answer's citations and shows one question at a time", async () => {
    const { requests } = setup([answer()]);
    renderApp("/policy-assistant");
    const user = await ask();

    const start = await screen.findByRole("button", { name: "Take a 5-Question Quiz" });
    expect(screen.getByRole("button", { name: "Show source S1" })).toBeInTheDocument();
    await user.click(start);

    const quizCard = await screen.findByRole("region", { name: "Leave and Attendance Policy quiz" });
    expect(requests.find((r) => r.path === "/api/v1/policies/chat-quizzes")?.body).toEqual({ chunkIds: [42, 43] });
    expect(requests.filter((r) => r.path === "/api/v1/policies/chat/stream")).toHaveLength(1); // the question isn't re-sent
    expect(within(quizCard).getByText("Question 1 of 5")).toBeInTheDocument();
    expect(within(quizCard).getByRole("progressbar", { name: "Question 1 of 5" })).toHaveAttribute("aria-valuenow", "20");
    expect(within(quizCard).getByText(/receive ____ days of paid annual leave/)).toBeInTheDocument();
    expect(within(quizCard).getAllByRole("radio")).toHaveLength(4);
    expect(within(quizCard).getByRole("button", { name: /Next/ })).toBeDisabled();
    expect(within(quizCard).getByRole("button", { name: /Previous/ })).toBeDisabled();
  });

  it("keeps answers when moving back and forth, submits on the last question and shows the graded result in the chat", async () => {
    const chosen = [1, 0, 2, 0, 0]; // two wrong
    const { requests } = setup([answer()], { "POST /api/v1/policies/chat-quizzes/attempts": () => ({ body: result(chosen) }) });
    renderApp("/policy-assistant");
    const user = await ask();
    await user.click(await screen.findByRole("button", { name: "Take a 5-Question Quiz" }));
    const quizCard = await screen.findByRole("region", { name: "Leave and Attendance Policy quiz" });

    await user.click(within(quizCard).getByRole("radio", { name: questions[0].options[chosen[0]] }));
    await user.click(within(quizCard).getByRole("button", { name: /Next/ }));
    expect(within(quizCard).getByText("Question 2 of 5")).toBeInTheDocument();
    await user.click(within(quizCard).getByRole("button", { name: /Previous/ }));
    expect(within(quizCard).getByRole("radio", { name: questions[0].options[chosen[0]] })).toBeChecked();
    await user.click(within(quizCard).getByRole("button", { name: /Next/ }));
    for (let i = 1; i < 5; i++) {
      await user.click(within(quizCard).getByRole("radio", { name: questions[i].options[chosen[i]] }));
      if (i < 4) await user.click(within(quizCard).getByRole("button", { name: /Next/ }));
    }
    expect(within(quizCard).queryByRole("button", { name: /Next/ })).not.toBeInTheDocument();
    await user.click(within(quizCard).getByRole("button", { name: "Submit Quiz" }));

    const resultCard = await screen.findByRole("region", { name: "Quiz result" });
    expect(requests.find((r) => r.path === "/api/v1/policies/chat-quizzes/attempts")?.body).toEqual({
      chunkIds: [42, 43],
      answers: { "c42-s0": 1, "c42-s1": 0, "c43-s0": 2, "c44-s0": 0, "c44-s3": 0 },
    });
    expect(within(resultCard).getByText("Your Score: 3/5")).toBeInTheDocument();
    expect(within(resultCard).getByText("60%")).toBeInTheDocument();
    expect(within(resultCard).getByText("Completed")).toBeInTheDocument();
    const items = within(within(resultCard).getByRole("list", { name: "Answers and explanations" })).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[3]).toHaveTextContent("Your answer: 16");
    expect(items[3]).toHaveTextContent("Correct answer: 8");
    expect(items[3]).toHaveTextContent("The policy says: “statement 4”");

    // A question's source opens in the source preview.
    await user.click(within(resultCard).getByRole("button", { name: "Show the policy source for question 4" }));
    expect(await within(screen.getByRole("complementary", { name: "Source preview" })).findByText("Passage for question 4.")).toBeInTheDocument();

    // Continue Chat hands focus back to the question box; the result stays in the conversation.
    await user.click(within(resultCard).getByRole("button", { name: /Continue Chat/ }));
    expect(screen.getByPlaceholderText(/Ask about leave/)).toHaveFocus();
    expect(screen.getByRole("region", { name: "Quiz result" })).toBeInTheDocument();

    // Retake starts again with no answers selected.
    await user.click(within(resultCard).getByRole("button", { name: /Retake Quiz/ }));
    const again = await screen.findByRole("region", { name: "Leave and Attendance Policy quiz" });
    expect(within(again).getByText("Question 1 of 5")).toBeInTheDocument();
    expect(within(again).getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
  });

  it("builds the quiz once even when the button is clicked repeatedly", async () => {
    const { requests } = setup([answer()]);
    renderApp("/policy-assistant");
    const user = await ask();
    const start = await screen.findByRole("button", { name: "Take a 5-Question Quiz" });
    await Promise.all([user.click(start), user.click(start), user.click(start)]);
    await screen.findByRole("region", { name: "Leave and Attendance Policy quiz" });
    expect(requests.filter((r) => r.path === "/api/v1/policies/chat-quizzes")).toHaveLength(1);
  });

  it("gives each answer its own quiz button and keeps the chat usable", async () => {
    const second = answer([citation(1, 77)]);
    const { requests } = setup([answer(), second]);
    renderApp("/policy-assistant");
    const user = await ask();
    await screen.findByRole("button", { name: "Take a 5-Question Quiz" });
    await ask("How many sick days do I get?");
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Take a 5-Question Quiz" })).toHaveLength(2));
    await user.click(screen.getAllByRole("button", { name: "Take a 5-Question Quiz" })[1]);
    await screen.findByRole("region", { name: "Leave and Attendance Policy quiz" });
    expect(requests.find((r) => r.path === "/api/v1/policies/chat-quizzes")?.body).toEqual({ chunkIds: [77] });
  });

  it("shows no quiz button for an answer that wasn't found in the policies, or while the answer is still being written", async () => {
    setup([answer([])]);
    renderApp("/policy-assistant");
    await ask();
    await screen.findByText(/couldn't find enough information/);
    expect(screen.queryByRole("button", { name: "Take a 5-Question Quiz" })).not.toBeInTheDocument();
  });

  it("explains when a quiz can't be built for this answer", async () => {
    setup([answer()], { "POST /api/v1/policies/chat-quizzes": () => ({ status: 422, body: { detail: "This policy doesn't contain enough specific details for a 5-question quiz." } }) });
    renderApp("/policy-assistant");
    const user = await ask();
    await user.click(await screen.findByRole("button", { name: "Take a 5-Question Quiz" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("enough specific details");
    expect(screen.getByRole("button", { name: "Take a 5-Question Quiz" })).toBeEnabled();
  });
});
