export type PolicyCategory = "Leave" | "Benefits" | "Payroll" | "Onboarding" | "Hybrid Work" | "IT & Security" | "Conduct";

export interface SuggestedQuestion {
  question: string;
  category: PolicyCategory;
}

// ---- Chat API (POST /api/v1/policies/chat) ----

export type EvidenceLevel = "strong" | "moderate" | "weak" | "insufficient" | "no_documents";

export interface PolicyCitation {
  /** Reference used in the answer text, e.g. "S1". */
  sourceId: string;
  chunkId: number;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  section: string | null;
  excerpt: string;
  score: number;
}

export interface ChatResponse {
  answer: string;
  citations: PolicyCitation[];
  evidence: {
    level: EvidenceLevel;
    topScore: number | null;
    supportingPassages: number;
    explanation: string;
    /** Passages from different documents stating different figures (added in Phase 3.3; may be absent from older servers). */
    conflicts?: { sourceIds: string[]; documentNames: string[]; values: string[]; unit: string; description: string }[];
  };
  escalation: { recommended: boolean; reason: string | null };
  answeredFromDocuments: boolean;
  model: string | null;
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export type AssistantState = "ready" | "not_configured" | "provider_unreachable" | "no_documents" | "indexing" | "retrieval_unavailable";

export type ProviderConnection = "not_checked" | "connected" | "not_configured" | "auth_failed" | "unreachable" | "timeout" | "model_not_found" | "error";

export interface AssistantStatus {
  llmConfigured: boolean;
  llmModel: string;
  embeddingModel: string;
  readyDocuments: number;
  /** First thing preventing answers, or "ready" (absent on older APIs). */
  state?: AssistantState;
  provider?: {
    configured: boolean;
    model: string;
    host: string | null;
    connection: ProviderConnection;
    message: string | null;
    checkedAt: string | null;
  };
  knowledge?: {
    totalDocuments: number;
    readyDocuments: number;
    processingDocuments: number;
    failedDocuments: number;
    indexedPassages: number;
    expectedPassages: number;
    retrievalAvailable: boolean;
    message: string | null;
  };
}

// ---- Conversation state in the UI ----

export type ChatMessage =
  | { id: string; role: "user"; content: string; timestamp: string }
  | { id: string; role: "assistant"; content: string; timestamp: string; response: ChatResponse }
  | { id: string; role: "error"; content: string; timestamp: string; code: string | null; retryQuestion: string };
