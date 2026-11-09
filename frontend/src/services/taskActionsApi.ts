import type { TaskActionState, TaskActionSubmission } from "../types/taskActions";
import { ApiError, apiRequest, apiBlob } from "./apiClient";

const BASE_PATH = "/api/v1/onboarding/tasks";

function assertState(value: unknown): TaskActionState {
  if (!value || typeof value !== "object" || !("actionType" in value) || !("task" in value)) {
    throw new ApiError("The server returned an unexpected task format.", null);
  }
  return value as TaskActionState;
}

const taskPath = (taskId: string) => `${BASE_PATH}/${encodeURIComponent(taskId)}`;

/** What the task asks the employee to do, with their saved progress. */
export async function fetchTaskAction(taskId: string, signal?: AbortSignal): Promise<TaskActionState> {
  return assertState(await apiRequest<unknown>(`${taskPath(taskId)}/action`, { signal }));
}

/** Saves progress or completes the task; the server validates everything (422 with field errors otherwise). */
export async function submitTaskAction(taskId: string, submission: TaskActionSubmission): Promise<TaskActionState> {
  return assertState(await apiRequest<unknown>(`${taskPath(taskId)}/action`, { method: "POST", body: JSON.stringify(submission) }, { timeoutMs: 20_000 }));
}

export async function uploadTaskDocument(taskId: string, documentType: string, file: File): Promise<TaskActionState> {
  const form = new FormData();
  form.append("documentType", documentType);
  form.append("file", file);
  return assertState(await apiRequest<unknown>(`${taskPath(taskId)}/documents`, { method: "POST", body: form }, { timeoutMs: 60_000 }));
}

export async function deleteTaskDocument(taskId: string, documentId: number): Promise<TaskActionState> {
  return assertState(await apiRequest<unknown>(`${taskPath(taskId)}/documents/${documentId}`, { method: "DELETE" }));
}

/** The employee's own uploaded file (fetched with the session cookie, so it can be opened in a new tab). */
export function fetchTaskDocumentFile(taskId: string, documentId: number): Promise<Blob> {
  return apiBlob(`${taskPath(taskId)}/documents/${documentId}/file`);
}

/** A published policy's original file, for reading inside a policy acknowledgment task. */
export function fetchPolicyFile(documentId: string): Promise<Blob> {
  return apiBlob(`/api/v1/policies/documents/${encodeURIComponent(documentId)}/file`);
}
