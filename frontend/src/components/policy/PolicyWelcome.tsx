import { ArrowUpRight } from "lucide-react";
import { policyCategoryIcons } from "../../config/policyMeta";
import { policyCategories, suggestedQuestions } from "../../data/mockPolicyAssistant";
import type { PolicyCategory } from "../../types/policyAssistant";
import { AssistantMark } from "../ui/AssistantMark";

interface PolicyWelcomeProps {
  firstName: string;
  category: PolicyCategory | "All";
  onCategoryChange: (category: PolicyCategory | "All") => void;
  onAsk: (question: string) => void;
  /** Disables the prompt cards while the assistant can't answer (not configured, no documents…). */
  disabled?: boolean;
}

const chip = "focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors";

/** Empty-conversation screen: assistant identity, topic chips and prompt cards. */
export function PolicyWelcome({ firstName, category, onCategoryChange, onAsk, disabled = false }: PolicyWelcomeProps) {
  const prompts = (category === "All" ? suggestedQuestions : suggestedQuestions.filter((q) => q.category === category)).slice(0, 4);

  return (
    <div className="mx-auto flex max-w-2xl animate-fade-up flex-col items-center px-2 py-6 text-center sm:py-10">
      <span className="relative flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-primary-100" aria-hidden="true" />
        <span className="absolute inset-2.5 rounded-full border border-primary-200/70" aria-hidden="true" />
        <span className="absolute inset-0 animate-halo rounded-full" aria-hidden="true" />
        <AssistantMark size={44} />
      </span>
      <h2 className="mt-5 text-[22px] font-semibold tracking-[-0.02em] text-primary-800">How can I help, {firstName}?</h2>
      <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-slate-500">
        Ask about leave, benefits, payroll or workplace policies. I answer only from your uploaded company policies and cite every source.
      </p>

      {/* Topic chips (the side rail offers the same filter on wide screens) */}
      <div className="mt-5 flex flex-wrap justify-center gap-1.5 xl:hidden" role="group" aria-label="Policy topics">
        {(["All", ...policyCategories] as const).map((option) => {
          const selected = option === category;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onCategoryChange(option)}
              aria-pressed={selected}
              className={`${chip} ${selected ? "border-primary-500 bg-primary-500 text-white" : "border-line bg-white text-slate-600 hover:border-primary-200 hover:text-primary-700"}`}
            >
              {option}
            </button>
          );
        })}
      </div>

      <ul className="mt-6 grid w-full gap-2.5 text-left sm:grid-cols-2">
        {prompts.map(({ question, category: topic }) => {
          const Icon = policyCategoryIcons[topic];
          return (
            <li key={question}>
              <button
                type="button"
                onClick={() => onAsk(question)}
                disabled={disabled}
                className="focus-ring group flex h-full w-full disabled:pointer-events-none disabled:opacity-50 items-start gap-3 rounded-panel border border-line bg-white p-4 text-left shadow-card transition-all duration-150 hover:-translate-y-px hover:border-primary-200 hover:shadow-raised"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-500">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold leading-snug text-navy-900">{question}</span>
                  <span className="mt-1 block text-xs text-slate-500">{topic}</span>
                </span>
                <ArrowUpRight size={15} className="shrink-0 text-slate-300 transition-colors group-hover:text-primary-500" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
