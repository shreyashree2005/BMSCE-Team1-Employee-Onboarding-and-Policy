import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileSearch, Search, SearchX } from "lucide-react";
import { ApiError } from "../../services/apiClient";
import { searchPolicies } from "../../services/policyDocumentsApi";
import type { PolicyDocument, PolicySearchResponse } from "../../types/policyDocuments";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { Skeleton } from "../ui/Skeleton";
import { SearchResultCard } from "./SearchResultCard";

const EXAMPLE_QUERIES = ["How many days of annual leave do I get?", "What should I do with a phishing email?", "When is salary paid?"];

type SearchState =
  | { kind: "idle" }
  | { kind: "loading"; query: string }
  | { kind: "done"; response: PolicySearchResponse }
  | { kind: "error"; message: string; query: string };

interface PolicySearchPanelProps {
  documents: PolicyDocument[];
  /** True while the document list is still loading (avoids flashing the "nothing to search" state). */
  documentsLoading: boolean;
}

export function PolicySearchPanel({ documents, documentsLoading }: PolicySearchPanelProps) {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);
  const [documentId, setDocumentId] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const readyDocuments = documents.filter((doc) => doc.status === "ready");
  const canSearch = readyDocuments.length > 0;

  useEffect(() => () => abortRef.current?.abort(), []);

  // If the filtered document is deleted, fall back to searching everything.
  useEffect(() => {
    if (documentId && !readyDocuments.some((doc) => doc.id === documentId)) setDocumentId("");
  }, [documentId, readyDocuments]);

  const runSearch = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 2 || !canSearch) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: "loading", query: trimmed });
    try {
      const response = await searchPolicies({ query: trimmed, topK, documentId: documentId || undefined }, controller.signal);
      setState({ kind: "done", response });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ kind: "error", query: trimmed, message: error instanceof ApiError ? error.message : "Search failed. Please try again." });
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void runSearch(query);
  };

  return (
    <section aria-labelledby="semantic-search-heading" className="rounded-panel border border-line bg-white shadow-card">
      <div className="border-b border-line px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-500">
            <FileSearch size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 id="semantic-search-heading" className="text-[15px] font-semibold tracking-tight text-primary-700">
              Semantic search
            </h2>
            <p className="mt-0.5 text-[13px] text-slate-500">Find policy passages by meaning, not just keywords.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-2.5">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={canSearch ? "e.g. How much vacation do I get?" : "Upload a document to enable search"}
              aria-label="Search query"
              maxLength={500}
              disabled={!canSearch}
              className="h-11 w-full rounded-lg border border-line-strong bg-white pl-9 pr-3 text-[13.5px] text-navy-900 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-100/70 disabled:bg-surface"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="search-document">
              Limit to document
            </label>
            <select
              id="search-document"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              disabled={!canSearch}
              className="focus-ring h-9 min-w-0 flex-1 rounded-lg border border-line bg-white px-2.5 text-xs text-navy-900"
            >
              <option value="">All documents</option>
              {readyDocuments.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.filename}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="search-top-k">
              Number of results
            </label>
            <select
              id="search-top-k"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              disabled={!canSearch}
              className="focus-ring h-9 rounded-lg border border-line bg-white px-2.5 text-xs text-navy-900"
            >
              {[3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" className="h-9" disabled={!canSearch || query.trim().length < 2 || state.kind === "loading"}>
              Search
            </Button>
          </div>
        </form>
      </div>

      <div className="space-y-3 bg-surface/50 px-5 py-5 sm:px-6" aria-live="polite">
        {documentsLoading ? (
          <div role="status" aria-label="Loading documents" className="space-y-2">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ) : !canSearch ? (
          <EmptyState icon={FileSearch} title="Nothing to search yet" message="Upload at least one policy document. Its passages become searchable as soon as processing finishes." compact />
        ) : state.kind === "idle" ? (
          <div>
            <p className="eyebrow mb-2 text-slate-400">Try a question</p>
            <ul className="space-y-1.5">
              {EXAMPLE_QUERIES.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(example);
                      void runSearch(example);
                    }}
                    className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2 text-left text-[13px] text-navy-900 transition-colors hover:border-primary-200 hover:bg-primary-50/50"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : state.kind === "loading" ? (
          <div role="status" aria-label="Searching policy documents" className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-panel border border-line bg-white p-4">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="mt-3 h-3 w-full" />
                <Skeleton className="mt-2 h-3 w-4/5" />
              </div>
            ))}
          </div>
        ) : state.kind === "error" ? (
          <div className="rounded-panel border border-line bg-white">
            <ErrorState title="Search failed" message={state.message} onRetry={() => void runSearch(state.query)} />
          </div>
        ) : state.response.results.length === 0 ? (
          <EmptyState icon={SearchX} title="No matching passages" message="Try rephrasing your question or searching all documents." compact />
        ) : (
          <>
            <p className="text-xs text-slate-500">
              {state.response.results.length} passage{state.response.results.length === 1 ? "" : "s"} for “{state.response.query}” · searched{" "}
              {state.response.searchedChunks} passages
            </p>
            {state.response.results.map((result, index) => (
              <SearchResultCard key={result.chunkId} result={result} rank={index + 1} query={state.response.query} />
            ))}
            <p className="pt-1 text-[11px] leading-relaxed text-slate-400">
              Retrieval preview: these are the raw passages the assistant will use to answer questions in the next phase. Model: {state.response.embeddingModel}.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
