import { Link } from "react-router-dom";
import { BadgeCheck, FileText, Layers, Library, Settings2 } from "lucide-react";
import { policyCategoryIcons } from "../../config/policyMeta";
import { useCurrentUser } from "../../context/AuthContext";
import { policyCategories, suggestedQuestions } from "../../data/mockPolicyAssistant";
import type { PolicyCategory } from "../../types/policyAssistant";
import type { PolicyDocument } from "../../types/policyDocuments";

interface KnowledgeRailProps {
  category: PolicyCategory | "All";
  onCategoryChange: (category: PolicyCategory | "All") => void;
  documents: PolicyDocument[];
  documentId: string | null;
  onDocumentChange: (documentId: string | null) => void;
}

const rowClasses = (selected: boolean) =>
  `focus-ring flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors ${
    selected ? "bg-white font-semibold text-navy-900 shadow-card ring-1 ring-line" : "text-slate-600 hover:bg-white/70 hover:text-navy-900"
  }`;

/** Left rail: which documents the assistant answers from (filter), plus topic filters for the example questions. */
export function KnowledgeRail({ category, onCategoryChange, documents, documentId, onDocumentChange }: KnowledgeRailProps) {
  const ready = documents.filter((doc) => doc.status === "ready");
  const isHr = useCurrentUser().role === "hr";

  return (
    <aside aria-label="Knowledge base" className="flex min-h-0 w-full flex-col border-r border-line bg-surface/60">
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
        <p className="eyebrow px-2 text-slate-400">Answer from</p>
        <ul className="mt-2 space-y-0.5">
          <li>
            <button type="button" onClick={() => onDocumentChange(null)} aria-pressed={documentId === null} className={rowClasses(documentId === null)}>
              <Library size={15} className={documentId === null ? "text-primary-500" : "text-slate-400"} aria-hidden="true" />
              <span className="flex-1">All policies</span>
              <span className="text-[11px] text-slate-400 tabular-nums">{ready.length}</span>
            </button>
          </li>
          {ready.map((doc) => {
            const selected = doc.id === documentId;
            return (
              <li key={doc.id}>
                <button type="button" onClick={() => onDocumentChange(selected ? null : doc.id)} aria-pressed={selected} title={doc.filename} className={rowClasses(selected)}>
                  <FileText size={14} className={`shrink-0 ${selected ? "text-primary-500" : "text-slate-400"}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{doc.filename}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {ready.length === 0 && (
          <p className="mt-1 px-2 text-xs leading-relaxed text-slate-500">
            {isHr ? "No policies indexed yet. Upload one to enable answers." : "HR hasn't published any policies yet."}
          </p>
        )}
        <Link to="/documents" className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded px-2 text-xs font-semibold text-primary-600 hover:text-primary-700">
          <Settings2 size={12} aria-hidden="true" />
          {isHr ? (ready.length === 0 ? "Upload documents" : "Manage documents") : "Browse policy library"}
        </Link>

        <p className="eyebrow mt-6 px-2 text-slate-400">Example topics</p>
        <ul className="mt-2 space-y-0.5">
          {(["All", ...policyCategories] as const).map((topic) => {
            const Icon = topic === "All" ? Layers : policyCategoryIcons[topic];
            const count = topic === "All" ? suggestedQuestions.length : suggestedQuestions.filter((q) => q.category === topic).length;
            const selected = topic === category;
            return (
              <li key={topic}>
                <button type="button" onClick={() => onCategoryChange(topic)} aria-pressed={selected} className={rowClasses(selected)}>
                  <Icon size={15} className={selected ? "text-primary-500" : "text-slate-400"} aria-hidden="true" />
                  <span className="flex-1">{topic}</span>
                  <span className="text-[11px] text-slate-400 tabular-nums">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="flex items-start gap-1.5 border-t border-line p-4 text-[11px] leading-relaxed text-slate-500">
        <BadgeCheck size={13} className="mt-px shrink-0 text-emerald-600" aria-hidden="true" />
        Answers use only the uploaded policies and always cite their sources.
      </p>
    </aside>
  );
}
