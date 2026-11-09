import type { PolicyDocument, PolicySearchResponse, PolicySearchResult } from "../types/policyDocuments";
import { ApiError, apiRequest } from "./apiClient";

const BASE_PATH = "/api/v1/policies";
// Processing (and the first search after a restart) may need to load the embedding model.
const MODEL_TIMEOUT_MS = 120_000;

export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt"] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function isPolicyDocument(value: unknown): value is PolicyDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Record<string, unknown>;
  return (
    typeof doc.id === "string" &&
    typeof doc.filename === "string" &&
    ["pdf", "docx", "txt"].includes(String(doc.fileType)) &&
    ["processing", "ready", "failed"].includes(String(doc.status)) &&
    typeof doc.chunkCount === "number" &&
    typeof doc.sizeBytes === "number" &&
    typeof doc.uploadedAt === "string"
  );
}

function isSearchResult(value: unknown): value is PolicySearchResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return typeof result.chunkId === "number" && typeof result.documentName === "string" && typeof result.text === "string" && typeof result.score === "number";
}

function assertDocument(value: unknown): PolicyDocument {
  if (!isPolicyDocument(value)) throw new ApiError("The server returned an unexpected document format.", null);
  return value;
}

export async function fetchPolicyDocuments(signal?: AbortSignal): Promise<PolicyDocument[]> {
  const data = await apiRequest<unknown>(`${BASE_PATH}/documents`, { signal });
  if (!Array.isArray(data)) throw new ApiError("The server returned an unexpected document list.", null);
  return data.map(assertDocument);
}

export async function uploadPolicyDocument(file: File): Promise<PolicyDocument> {
  const body = new FormData();
  body.append("file", file, file.name);
  const data = await apiRequest<unknown>(`${BASE_PATH}/documents`, { method: "POST", body }, { timeoutMs: MODEL_TIMEOUT_MS });
  return assertDocument(data);
}

export async function deletePolicyDocument(documentId: string): Promise<void> {
  await apiRequest<void>(`${BASE_PATH}/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
}

export interface SearchParams {
  query: string;
  topK: number;
  documentId?: string;
}

export async function searchPolicies({ query, topK, documentId }: SearchParams, signal?: AbortSignal): Promise<PolicySearchResponse> {
  const data = await apiRequest<PolicySearchResponse>(
    `${BASE_PATH}/search`,
    { method: "POST", body: JSON.stringify({ query, topK, ...(documentId ? { documentId } : {}) }), signal },
    { timeoutMs: MODEL_TIMEOUT_MS },
  );
  if (!data || !Array.isArray(data.results) || !data.results.every(isSearchResult)) {
    throw new ApiError("The server returned unexpected search results.", null);
  }
  return data;
}

/** Client-side pre-check mirroring the server rules, so obvious mistakes fail instantly. */
export function validateFileForUpload(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) return `“${file.name}” isn't supported. Upload a PDF, DOCX or TXT file.`;
  if (file.size === 0) return `“${file.name}” is empty.`;
  if (file.size > MAX_UPLOAD_BYTES) return `“${file.name}” is larger than the 10 MB limit.`;
  return null;
}
