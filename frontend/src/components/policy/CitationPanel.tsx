import { BadgeCheck, BookOpen, FileText } from "lucide-react";
import type { PolicyCitation } from "../../types/policyAssistant";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { citationLocation } from "./CitationCard";

interface CitationPanelProps {
  citations: PolicyCitation[];
  activeIndex: number;
  loading: boolean;
  onSelect: (index: number) => void;
}

/** Preview of the selected cited passage, styled like an excerpt from the source document. */
export function CitationPanel({ citations, activeIndex, loading, onSelect }: CitationPanelProps) {
  const active = citations[activeIndex];

  return (
    <aside aria-label="Source preview" className="flex min-h-0 flex-1 flex-col border-l border-line bg-surface/60">
      <div className="flex items-center gap-2 border-b border-line bg-white px-5 py-3.5">
        <BookOpen size={15} className="text-primary-500" aria-hidden="true" />
        <h2 className="text-[13px] font-semibold text-primary-700">Source preview</h2>
        {citations.length > 0 && !loading && <span className="ml-auto text-[11px] text-slate-400">{citations.length} cited</span>}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="rounded-panel border border-line bg-white p-5" aria-label="Finding sources">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-4 w-3/4" />
            <Skeleton className="mt-5 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        ) : !active ? (
          <EmptyState icon={FileText} title="No source selected" message="Every answer cites the policy passages it's based on. Select a citation to preview it here." compact />
        ) : (
          <>
            <article key={active.chunkId} className="animate-fade-in overflow-hidden rounded-panel border border-line bg-white shadow-card">
              <header className="border-b border-line bg-gradient-to-b from-primary-50/60 to-white px-5 pb-4 pt-5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-600 text-white">
                    <FileText size={14} aria-hidden="true" />
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                    <BadgeCheck size={11} aria-hidden="true" />
                    Uploaded policy
                  </span>
                  <span className="ml-auto rounded bg-primary-50 px-1.5 py-0.5 text-[10.5px] font-bold text-primary-700">{active.sourceId}</span>
                </div>
                <h3 className="mt-3 break-words text-[15px] font-semibold leading-snug text-navy-900">{active.documentName}</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {citationLocation(active)} · Passage #{active.chunkId}
                </p>
              </header>
              <div className="px-5 py-4">
                <blockquote className="rounded-r-md border-l-[3px] border-primary-500 bg-primary-50/70 px-3.5 py-3 text-[13px] leading-relaxed text-navy-900">{active.excerpt}</blockquote>
                {/* Quiz sources have no search score (score < 0), so no match strength is shown for them. */}
                {active.score >= 0 && (
                  <p className="mt-3 text-[11px] text-slate-400" title="Cosine similarity between your question and this passage">
                    Match strength {Math.round(active.score * 100)}% · how closely this passage matches your question
                  </p>
                )}
              </div>
            </article>

            {citations.length > 1 && (
              <div className="mt-4">
                <p className="eyebrow mb-2 px-1 text-slate-400">Also cited</p>
                <ul className="space-y-1.5">
                  {citations.map((citation, index) =>
                    index === activeIndex ? null : (
                      <li key={citation.chunkId}>
                        <button
                          type="button"
                          onClick={() => onSelect(index)}
                          className="focus-ring flex w-full items-start gap-2.5 rounded-lg border border-line bg-white p-2.5 text-left transition-colors hover:border-primary-200"
                        >
                          <span className="flex h-5 shrink-0 items-center justify-center rounded bg-primary-50 px-1.5 text-[10.5px] font-bold text-primary-600">{citation.sourceId}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-navy-900">{citation.documentName}</span>
                            <span className="block truncate text-[11px] text-slate-500">{citationLocation(citation)}</span>
                          </span>
                        </button>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
