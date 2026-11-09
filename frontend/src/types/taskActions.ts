import type { OnboardingTask } from "./dashboard";

/** How a task is completed. Mirrors the API's TaskActionState (backend/app/schemas/task_actions.py). */
export type TaskActionType = "form" | "document_upload" | "checklist" | "policy_acknowledgment" | "training" | "quiz";

export interface FormFieldDef {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "date" | "textarea" | "select" | "number" | "checkbox";
  required: boolean;
  maxLength: number;
  minLength: number;
  pattern: string | null;
  patternMessage: string | null;
  options: string[];
  help: string | null;
  fixedValue: string | null;
}

export interface UploadedDocument {
  id: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface DocumentRequirement {
  id: string;
  label: string;
  hint: string;
  uploaded: UploadedDocument | null;
}

export interface ChecklistItem {
  id: string;
  label: string;
  help: string;
  checked: boolean;
}

export interface PolicyToAcknowledge {
  policyId: string;
  title: string;
  available: boolean;
  documentId: string | null;
  filename: string | null;
  fileType: "pdf" | "docx" | "txt" | null;
  acknowledged: boolean;
  /** Understanding quiz for this policy; it must be passed to finish the task. */
  quizAvailable?: boolean;
  quizPassed?: boolean;
  quizBestScore?: number | null;
  quizTotal?: number | null;
}

export interface TrainingSection {
  id: string;
  title: string;
  paragraphs: string[];
  completed: boolean;
}

export interface QuizState {
  passMark: number;
  questions: { id: string; question: string; options: string[] }[];
  attempts: number;
  bestScore: number | null;
  lastScore: number | null;
  passed: boolean;
  lastResults: { questionId: string; correct: boolean }[];
}

export interface TaskActionState {
  task: OnboardingTask;
  actionType: TaskActionType;
  kind: string | null;
  instructions: string;
  completed: boolean;
  completedAt: string | null;
  message: string | null;
  fields: FormFieldDef[];
  values: Record<string, string | boolean>;
  maskedValues: Record<string, string>;
  documents: DocumentRequirement[];
  items: ChecklistItem[];
  policies: PolicyToAcknowledge[];
  signature: string | null;
  sections: TrainingSection[];
  quiz: QuizState | null;
}

export interface TaskActionSubmission {
  values?: Record<string, string | boolean>;
  checkedItems?: string[];
  acknowledgedPolicies?: string[];
  signature?: string;
  completedSection?: string;
  answers?: Record<string, number>;
  complete?: boolean;
}
