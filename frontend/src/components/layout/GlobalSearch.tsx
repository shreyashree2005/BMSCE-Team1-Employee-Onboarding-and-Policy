import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquareText, SearchX, type LucideIcon } from "lucide-react";
import { navItemsForRole } from "../../config/navigation";
import { taskCategoryIcons } from "../../config/taskMeta";
import { useCurrentUser } from "../../context/AuthContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { suggestedQuestions } from "../../data/mockPolicyAssistant";
import { useClickOutside } from "../../hooks/useClickOutside";
import { SearchInput } from "../ui/SearchInput";

interface SearchResult {
  id: string;
  group: "Pages" | "Tasks" | "Policy questions";
  label: string;
  hint: string;
  icon: LucideIcon;
  to: string;
}

const MAX_PER_GROUP = 4;

interface GlobalSearchProps {
  autoFocus?: boolean;
  onNavigate?: () => void;
  /** Focus the field when "/" is pressed anywhere outside a text input. */
  shortcut?: boolean;
}

/** Searches pages, onboarding tasks and suggested policy questions, then navigates to the match. */
export function GlobalSearch({ autoFocus = false, onNavigate, shortcut = false }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { tasks } = useOnboarding();
  const { role } = useCurrentUser();
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(containerRef, close, open);

  useEffect(() => {
    if (!shortcut) return;
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [shortcut]);

  const results = useMemo<SearchResult[]>(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    const matches = (text: string) => text.toLowerCase().includes(term);

    const pages: SearchResult[] = navItemsForRole(role)
      .filter((item) => matches(item.label) || matches(item.description))
      .map((item) => ({ id: item.path, group: "Pages", label: item.label, hint: item.description, icon: item.icon, to: item.path }));

    const taskResults: SearchResult[] = tasks
      .filter((task) => matches(task.title) || matches(task.category))
      .map((task) => ({
        id: task.id,
        group: "Tasks",
        label: task.title,
        hint: `${task.category} · ${task.stage}`,
        icon: taskCategoryIcons[task.category],
        to: `/onboarding?task=${task.id}`,
      }));

    const questions: SearchResult[] = suggestedQuestions
      .filter((q) => matches(q.question) || matches(q.category))
      .map((q) => ({
        id: q.question,
        group: "Policy questions",
        label: q.question,
        hint: `Ask the Policy Assistant · ${q.category}`,
        icon: MessageSquareText,
        to: `/policy-assistant?q=${encodeURIComponent(q.question)}&ask=1`,
      }));

    return [...pages.slice(0, MAX_PER_GROUP), ...taskResults.slice(0, MAX_PER_GROUP), ...questions.slice(0, MAX_PER_GROUP)];
  }, [query, tasks, role]);

  const goTo = (result: SearchResult) => {
    navigate(result.to);
    setQuery("");
    setOpen(false);
    onNavigate?.();
  };

  const groups = (["Pages", "Tasks", "Policy questions"] as const)
    .map((group) => ({ group, items: results.filter((r) => r.group === group) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="relative w-full" ref={containerRef}>
      <form
        className="relative"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (results[0]) goTo(results[0]);
        }}
      >
        <SearchInput
          ref={inputRef}
          value={query}
          onChange={(value) => {
            setQuery(value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          label="Search pages, tasks and policy questions"
          placeholder="Search tasks, pages, policy questions…"
          autoFocus={autoFocus}
        />
        {shortcut && !query && (
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line-strong bg-white px-1.5 text-[11px] font-medium text-slate-400" aria-hidden="true">
            /
          </kbd>
        )}
      </form>

      {open && query.trim() && (
        <div className="absolute left-0 right-0 z-40 mt-2 max-h-[70vh] origin-top animate-scale-in overflow-y-auto rounded-panel border border-line bg-white py-2 shadow-pop">
          {groups.length === 0 ? (
            <div className="flex items-center gap-3 px-4 py-4 text-sm text-slate-500">
              <SearchX size={18} className="text-slate-400" aria-hidden="true" />
              No results for “{query.trim()}”
            </div>
          ) : (
            groups.map(({ group, items }) => (
              <div key={group} className="py-1">
                <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group}</p>
                <ul>
                  {items.map((result) => {
                    const Icon = result.icon;
                    return (
                      <li key={result.id}>
                        <button
                          type="button"
                          onClick={() => goTo(result)}
                          className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
                        >
                          <Icon size={16} className="shrink-0 text-primary-500" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-navy-900">{result.label}</span>
                            <span className="block truncate text-xs text-slate-500">{result.hint}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
