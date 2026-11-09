import type { ReactNode } from "react";
import { ClipboardList } from "lucide-react";
import { useOnboarding } from "../../context/OnboardingContext";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { Skeleton } from "../ui/Skeleton";

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="rounded-panel bg-gradient-to-br from-primary-100 to-primary-50 px-9 pb-28 pt-10">
        <span className="block h-6 w-40 rounded-full bg-white/70" />
        <span className="mt-6 block h-10 w-80 max-w-full rounded-lg bg-white/80" />
        <span className="mt-4 block h-4 w-[28rem] max-w-full rounded bg-white/70" />
        <span className="mt-2 block h-4 w-72 max-w-full rounded bg-white/70" />
        <span className="mt-8 block h-11 w-52 rounded-lg bg-white/80" />
      </div>
      <div className="relative mx-6 -mt-20 rounded-panel border border-line bg-white p-7 shadow-raised">
        <Skeleton className="h-4 w-48" />
        <div className="mt-8 grid grid-cols-5 gap-6">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-3">
              <Skeleton className="h-11 w-11 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-28 w-full rounded-panel" />
    </div>
  );
}

function ChecklistSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-44 w-full rounded-panel" />
      <div className="rounded-panel border border-line bg-white">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-6 py-4 last:border-b-0">
            <Skeleton className="h-5 w-5 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-6 w-20 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

const skeletons = { overview: OverviewSkeleton, checklist: ChecklistSkeleton };

interface OnboardingDataGateProps {
  skeleton: keyof typeof skeletons;
  children: ReactNode;
}

/** Renders children once the onboarding checklist has loaded; otherwise a skeleton, an error or an empty state. */
export function OnboardingDataGate({ skeleton, children }: OnboardingDataGateProps) {
  const { tasks, loadState, loadError, reload } = useOnboarding();

  if (loadState === "loading") {
    const SkeletonView = skeletons[skeleton];
    return (
      <div role="status" aria-label="Loading your onboarding checklist">
        <SkeletonView />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="rounded-panel border border-line bg-white shadow-card">
        <ErrorState
          title="We couldn't load your onboarding checklist"
          message={loadError ?? "Something went wrong while contacting the server."}
          onRetry={reload}
          hint={
            <>
              Running locally? Start the API from the <code className="rounded bg-surface px-1 py-0.5 text-slate-600">backend</code> folder with{" "}
              <code className="rounded bg-surface px-1 py-0.5 text-slate-600">uvicorn app.main:app --reload --port 8000</code>.
            </>
          }
        />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-panel border border-line bg-white shadow-card">
        <EmptyState icon={ClipboardList} title="No onboarding tasks yet" message="Your HR team hasn't assigned any onboarding tasks. Check back soon." />
      </div>
    );
  }

  return <>{children}</>;
}
