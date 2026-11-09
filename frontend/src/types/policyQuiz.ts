/** Policy understanding quizzes. Mirrors backend/app/schemas/policy_quiz.py; answers only appear in graded results. */
export interface PolicyQuizAttempt {
  id: number;
  score: number;
  total: number;
  passed: boolean;
  createdAt: string;
}

export interface PolicyQuizSummary {
  policyId: string;
  title: string;
  questionCount: number;
  passScore: number;
  attempts: number;
  bestScore: number | null;
  passed: boolean;
  documentId: string | null;
}

export interface PolicyQuiz extends PolicyQuizSummary {
  passPercent: number;
  questions: { id: string; question: string; options: string[] }[];
  history: PolicyQuizAttempt[];
}

export interface PolicyQuizQuestionResult {
  id: string;
  question: string;
  options: string[];
  chosen: number;
  correctOption: number;
  correct: boolean;
  feedback: string;
  explanation: string;
  /** The policy passage the question came from (quizzes on a Policy Assistant answer). */
  source?: PolicyQuizSource | null;
}

export interface PolicyQuizSource {
  chunkId: number;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  section: string | null;
  excerpt: string;
}

/** A quiz built from a Policy Assistant answer's passages. Attempts are recorded under `quizKey`. */
export interface AnswerQuiz {
  quizKey: string;
  title: string;
  chunkIds: number[];
  questionCount: number;
  passScore: number;
  questions: { id: string; question: string; options: string[] }[];
  history: PolicyQuizAttempt[];
}

export interface PolicyQuizResult {
  policyId: string;
  title: string;
  score: number;
  total: number;
  passScore: number;
  passed: boolean;
  message: string;
  results: PolicyQuizQuestionResult[];
  history: PolicyQuizAttempt[];
  completedTaskIds: string[];
}
