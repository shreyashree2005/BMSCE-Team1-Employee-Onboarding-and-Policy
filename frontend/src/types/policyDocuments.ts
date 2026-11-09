export type DocumentStatus = "processing" | "ready" | "failed";

export type DocumentFileType = "pdf" | "docx" | "txt";

export interface PolicyDocument {
  id: string;
  filename: string;
  fileType: DocumentFileType;
  sizeBytes: number;
  status: DocumentStatus;
  pageCount: number | null;
  chunkCount: number;
  errorMessage: string | null;
  /** ISO 8601 timestamp */
  uploadedAt: string;
}

export interface PolicySearchResult {
  chunkId: number;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  pageNumber: number | null;
  section: string | null;
  text: string;
  /** Cosine similarity, roughly 0–1 (higher is more relevant). */
  score: number;
}

export interface PolicySearchResponse {
  query: string;
  results: PolicySearchResult[];
  embeddingModel: string;
  searchedChunks: number;
}
