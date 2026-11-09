import { Link } from "react-router-dom";
import { CloudOff, DatabaseZap, FileUp, KeyRound, Loader2, PlugZap, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { AssistantStatus } from "../../types/policyAssistant";
import { Button, ButtonLink } from "../ui/Button";

export type AssistantAvailability =
  | "loading"
  | "ready"
  | "backend_unavailable"
  | "llm_not_configured"
  | "provider_unreachable"
  | "no_documents"
  | "indexing"
  | "retrieval_unavailable";

/** Maps the API's readiness state to what the page can do. */
export function availabilityFromStatus(status: AssistantStatus): AssistantAvailability {
  switch (status.state) {
    case "ready":
      return "ready";
    case "not_configured":
      return "llm_not_configured";
    case "provider_unreachable":
      return "provider_unreachable";
    case "no_documents":
      return "no_documents";
    case "indexing":
      return "indexing";
    case "retrieval_unavailable":
      return "retrieval_unavailable";
    default:
      // Older API without `state`.
      return !status.llmConfigured ? "llm_not_configured" : status.readyDocuments === 0 ? "no_documents" : "ready";
  }
}

interface AssistantStatusBannerProps {
  availability: AssistantAvailability;
  status: AssistantStatus | null;
  /** HR sees configuration details and can upload; employees get plain-language guidance. */
  isHr: boolean;
  message?: string | null;
  checking?: boolean;
  onRetry: () => void;
}

const code = (text: string) => <code className="rounded bg-white/70 px-1">{text}</code>;

function Banner({ icon, tone, title, children, action }: { icon: ReactNode; tone: "amber" | "rose" | "blue"; title: string; children: ReactNode; action?: ReactNode }) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    blue: "border-primary-200 bg-primary-50 text-navy-900",
  };
  return (
    <div role="status" className={`flex flex-col gap-3 rounded-panel border px-4 py-3.5 sm:flex-row sm:items-center ${tones[tone]}`}>
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
        <p className="font-semibold">{title}</p>
        <div className="opacity-90">{children}</div>
      </div>
      {action}
    </div>
  );
}

/** Explains why the assistant can't answer yet, with the next step for each case. */
export function AssistantStatusBanner({ availability, status, isHr, message, checking = false, onRetry }: AssistantStatusBannerProps) {
  const retry = (label = "Check again") => (
    <Button variant="secondary" size="sm" onClick={onRetry} disabled={checking}>
      {checking ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={13} aria-hidden="true" />}
      {checking ? "Checking…" : label}
    </Button>
  );
  const searchLink = (
    <Link to="/documents" className="font-semibold underline">
      search the policies directly
    </Link>
  );

  switch (availability) {
    case "backend_unavailable":
      return (
        <Banner tone="rose" icon={<CloudOff size={20} className="text-rose-600" aria-hidden="true" />} title="Can't reach the OnboardIQ server" action={retry("Retry")}>
          {message ?? "Check that the backend is running."} Start it from the {code("backend")} folder with {code("uvicorn app.main:app --reload --port 8000")}.
        </Banner>
      );
    case "llm_not_configured":
      return (
        <Banner tone="amber" icon={<KeyRound size={20} className="text-amber-600" aria-hidden="true" />} title="AI provider not configured" action={retry()}>
          {isHr ? (
            <>
              Set {code("LLM_API_KEY")}, {code("LLM_MODEL")} and {code("LLM_BASE_URL")} in {code("backend/.env")} (see {code(".env.example")} for OpenAI, Groq,
              OpenRouter or a local Ollama), then restart the API. Meanwhile you can {searchLink}.
            </>
          ) : (
            <>The Policy Assistant hasn't been connected to an AI service yet. Your HR team needs to finish setting it up. Meanwhile you can {searchLink}.</>
          )}
        </Banner>
      );
    case "provider_unreachable":
      return (
        <Banner tone="rose" icon={<PlugZap size={20} className="text-rose-600" aria-hidden="true" />} title="Can't connect to the AI provider" action={retry()}>
          {isHr ? (
            <>
              {status?.provider?.message ?? "The connection check failed."} Update {code("backend/.env")} if needed and restart the API.
            </>
          ) : (
            <>The AI service isn't responding right now, so answers are paused. Please try again later or contact HR. You can still {searchLink}.</>
          )}
        </Banner>
      );
    case "retrieval_unavailable":
      return (
        <Banner tone="rose" icon={<DatabaseZap size={20} className="text-rose-600" aria-hidden="true" />} title="Policy search is unavailable" action={retry()}>
          {isHr ? (status?.knowledge?.message ?? "The policy search index couldn't be prepared. Check the API logs.") : "Policy search isn't working right now. Please try again later or contact HR."}
        </Banner>
      );
    case "indexing":
      return (
        <Banner tone="blue" icon={<Loader2 size={20} className="animate-spin text-primary-500" aria-hidden="true" />} title="Indexing policy documents" action={retry("Refresh")}>
          {status?.knowledge?.processingDocuments ?? 1} document{status?.knowledge?.processingDocuments === 1 ? " is" : "s are"} being processed. The assistant will be
          ready in a moment.
        </Banner>
      );
    case "no_documents":
      return (
        <Banner
          tone="blue"
          icon={<FileUp size={20} className="text-primary-500" aria-hidden="true" />}
          title="No policies uploaded yet"
          action={
            isHr ? (
              <ButtonLink to="/documents" size="sm">
                Upload policies
              </ButtonLink>
            ) : (
              retry()
            )
          }
        >
          {isHr
            ? "The assistant answers only from your company's uploaded policies. Upload at least one PDF, DOCX or TXT policy to get started."
            : "The assistant answers only from policies published by HR, and none have been published yet. Please check back later or contact HR."}
        </Banner>
      );
    default:
      return null;
  }
}

/** Short label + tone for the page header badge. */
export function availabilityBadge(availability: AssistantAvailability, status: AssistantStatus | null): { label: string; tone: "green" | "amber" | "rose" | "gray" } {
  switch (availability) {
    case "ready":
      return { label: `AI · ${status?.llmModel ?? "ready"}`, tone: "green" };
    case "loading":
      return { label: "Checking…", tone: "gray" };
    case "llm_not_configured":
      return { label: "AI not configured", tone: "amber" };
    case "provider_unreachable":
      return { label: "AI provider offline", tone: "rose" };
    case "no_documents":
      return { label: `AI · ${status?.llmModel ?? ""} · no policies`, tone: "amber" };
    case "indexing":
      return { label: "Indexing…", tone: "amber" };
    case "retrieval_unavailable":
      return { label: "Search unavailable", tone: "rose" };
    default:
      return { label: "Offline", tone: "rose" };
  }
}
