import type { AnswerQuiz, PolicyQuiz, PolicyQuizResult } from "../types/policyQuiz";
import { ApiError, apiRequest } from "./apiClient";

const BASE_PATH = "/api/v1/policies/quizzes";

/** Questions and options only; the server keeps the answers until an attempt is graded. */
export async function fetchPolicyQuiz(policyId: string, signal?: AbortSignal): Promise<PolicyQuiz> {
  const data = await apiRequest<unknown>(`${BASE_PATH}/${encodeURIComponent(policyId)}`, { signal });
  if (!data || typeof data !== "object" || !Array.isArray((data as PolicyQuiz).questions)) throw new ApiError("The server returned an unexpected quiz.", null);
  return data as PolicyQuiz;
}

export async function submitPolicyQuiz(policyId: string, answers: Record<string, number>): Promise<PolicyQuizResult> {
  const data = await apiRequest<unknown>(`${BASE_PATH}/${encodeURIComponent(policyId)}/attempts`, { method: "POST", body: JSON.stringify({ answers }) });
  if (!data || typeof data !== "object" || typeof (data as PolicyQuizResult).score !== "number") throw new ApiError("The server returned an unexpected result.", null);
  return data as PolicyQuizResult;
}

// ---- Quizzes on a Policy Assistant answer ----

const ANSWER_QUIZ_PATH = "/api/v1/policies/chat-quizzes";

/** Builds the 5-question quiz for an answer from the chunk IDs of its citations (in citation order). No answers included. */
export async function buildAnswerQuiz(chunkIds: number[], signal?: AbortSignal): Promise<AnswerQuiz> {
  const data = await apiRequest<unknown>(ANSWER_QUIZ_PATH, { method: "POST", body: JSON.stringify({ chunkIds }), signal });
  if (!data || typeof data !== "object" || !Array.isArray((data as AnswerQuiz).questions)) throw new ApiError("The server returned an unexpected quiz.", null);
  return data as AnswerQuiz;
}

/** Graded on the server (the quiz is rebuilt from the same passages) and saved to the employee's own history. */
export async function submitAnswerQuiz(chunkIds: number[], answers: Record<string, number>): Promise<PolicyQuizResult> {
  const data = await apiRequest<unknown>(`${ANSWER_QUIZ_PATH}/attempts`, { method: "POST", body: JSON.stringify({ chunkIds, answers }) });
  if (!data || typeof data !== "object" || typeof (data as PolicyQuizResult).score !== "number") throw new ApiError("The server returned an unexpected result.", null);
  return data as PolicyQuizResult;
}
