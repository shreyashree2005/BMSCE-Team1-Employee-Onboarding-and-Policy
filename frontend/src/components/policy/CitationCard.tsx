import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import type { PolicyCitation } from "../../types/policyAssistant";

export function citationLocation(citation: PolicyCitation): string {
  const parts = [];
  if (citation.pageNumber !== null) parts.push(`Page ${citation.pageNumber}`);
  if (citation.section) parts.push(citation.section);
  return parts.join(" · ") || "Whole document";
}

interface CitationCardProps {
  citation: PolicyCitation;
  active: boolean;
  onSelect: () => void;
}

/** Source reference under an answer; the excerpt expands inline (useful where the side preview isn't shown). */
export function CitationCard({ citation, active, onSelect }: CitationCardProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`rounded-lg border transition-colors ${active ? "border-primary-300 bg-primary-50" : "border-line bg-surface/60"}`}>
      <div className="flex items-start gap-2.5 p-2.5">
        <button type="button" onClick={onSelect} aria-pressed={active} className="focus-ring flex min-w-0 flex-1 items-start gap-2.5 rounded text-left">
          <span className={`flex h-5 shrink-0 items-center justify-center rounded px-1.5 text-[10.5px] font-bold ${active ? "bg-primary-500 text-white" : "bg-white text-primary-600 ring-1 ring-line"}`}>
            {citation.sourceId}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-xs font-semibold text-navy-900">
              <FileText size={11} className="shrink-0 text-slate-400" aria-hidden="true" />
              <span className="truncate" title={citation.documentName}>
                {citation.documentName}
              </span>
            </span>
            <span className="block truncate text-[11px] text-slate-500">{citationLocation(citation)}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-label={expanded ? `Hide excerpt from ${citation.documentName}` : `Show excerpt from ${citation.documentName}`}
          className="focus-ring flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-white hover:text-navy-900"
        >
          <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </div>
      {expanded && (
        <blockquote className="mx-2.5 mb-2.5 animate-fade-in border-l-2 border-primary-300 pl-2.5 text-xs leading-relaxed text-slate-600">{citation.excerpt}</blockquote>
      )}
    </div>
  );
}
