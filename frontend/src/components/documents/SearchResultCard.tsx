import { Fragment } from "react";
import { BookOpen, FileText, Hash } from "lucide-react";
import type { PolicySearchResult } from "../../types/policyDocuments";

const STOP_WORDS = new Set(["what", "when", "where", "which", "does", "with", "that", "this", "from", "have", "your", "about", "many", "much", "will", "into"]);

/** Highlights query words (4+ letters) in the excerpt so it's easy to see why a passage matched. */
function highlight(text: string, query: string) {
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])].filter((t) => !STOP_WORDS.has(t));
  if (terms.length === 0) return text;
  const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-sm bg-primary-100 px-0.5 text-navy-900">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

interface SearchResultCardProps {
  result: PolicySearchResult;
  rank: number;
  query: string;
}

export function SearchResultCard({ result, rank, query }: SearchResultCardProps) {
  const similarity = Math.max(0, Math.min(100, Math.round(result.score * 100)));
  return (
    <article className="animate-fade-up rounded-panel border border-line bg-white p-4 shadow-card">
      <header className="flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-600 text-[11px] font-bold text-white">{rank}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-navy-900">
            <FileText size={13} className="shrink-0 text-primary-500" aria-hidden="true" />
            <span className="truncate" title={result.documentName}>
              {result.documentName}
            </span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            {result.pageNumber !== null && (
              <span className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 ring-1 ring-inset ring-line">
                <BookOpen size={11} aria-hidden="true" />
                Page {result.pageNumber}
              </span>
            )}
            {result.section && <span className="max-w-[180px] truncate rounded bg-surface px-1.5 py-0.5 ring-1 ring-inset ring-line">{result.section}</span>}
            <span className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 ring-1 ring-inset ring-line">
              <Hash size={11} aria-hidden="true" />
              Passage {result.chunkIndex + 1}
            </span>
          </p>
        </div>
        <div className="w-20 shrink-0 text-right" title={`Cosine similarity ${result.score.toFixed(3)}`}>
          <p className="text-[13px] font-semibold text-navy-900 tabular-nums">{similarity}%</p>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full origin-left animate-grow-x rounded-full bg-primary-500" style={{ width: `${similarity}%` }} />
          </div>
          <p className="mt-0.5 text-[10px] text-slate-400">similarity</p>
        </div>
      </header>
      <blockquote className="mt-3 border-l-[3px] border-primary-200 pl-3 text-[13px] leading-relaxed text-slate-700">{highlight(result.text, query)}</blockquote>
    </article>
  );
}
