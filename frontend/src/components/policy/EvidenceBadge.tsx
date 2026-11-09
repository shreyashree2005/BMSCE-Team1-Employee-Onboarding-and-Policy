import { ShieldCheck, ShieldAlert, ShieldQuestion, type LucideIcon } from "lucide-react";
import type { ChatResponse, EvidenceLevel } from "../../types/policyAssistant";

const levelMeta: Record<EvidenceLevel, { label: string; icon: LucideIcon; className: string }> = {
  strong: { label: "Strong evidence", icon: ShieldCheck, className: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
  moderate: { label: "Good evidence", icon: ShieldCheck, className: "bg-primary-50 text-primary-700 ring-primary-100" },
  weak: { label: "Limited evidence", icon: ShieldAlert, className: "bg-amber-50 text-amber-800 ring-amber-100" },
  insufficient: { label: "Not found in policies", icon: ShieldQuestion, className: "bg-slate-100 text-slate-600 ring-slate-200" },
  no_documents: { label: "No policies uploaded", icon: ShieldQuestion, className: "bg-slate-100 text-slate-600 ring-slate-200" },
};

/** Evidence indicator from retrieval similarity. Deliberately not shown as a percentage or probability. */
export function EvidenceBadge({ evidence }: { evidence: ChatResponse["evidence"] }) {
  const meta = levelMeta[evidence.level];
  const Icon = meta.icon;
  const tooltip = `${evidence.explanation} Based on how closely the policy text matches your question. It is not a guarantee that the answer is correct.`;
  return (
    <span title={tooltip} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${meta.className}`}>
      <Icon size={11} aria-hidden="true" />
      {meta.label}
      <span className="sr-only">. {tooltip}</span>
    </span>
  );
}
