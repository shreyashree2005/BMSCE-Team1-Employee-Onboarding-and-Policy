interface BrandMarkProps {
  size?: number;
}

/**
 * OnboardIQ logo mark: a navy tile with a rising journey path that ends in a
 * royal-blue node, echoing the onboarding journey visual used across the app.
 */
export function BrandMark({ size = 34 }: BrandMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <rect width="34" height="34" rx="9" fill="#142B4A" />
      <path d="M8 24.5c4.5 0 5-6.5 9-6.5s4.5-6.5 9-6.5" stroke="#5C8BEC" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="8" cy="24.5" r="2.2" fill="#8EB0F2" />
      <circle cx="26" cy="11.5" r="3.6" fill="#346FE7" stroke="#fff" strokeWidth="1.6" />
    </svg>
  );
}

/** `tone="light"` renders the wordmark in white for the blue sidebar. */
export function BrandWordmark({ compact = false, tone = "dark" }: { compact?: boolean; tone?: "dark" | "light" }) {
  const light = tone === "light";
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark />
      {!compact && (
        <span className="leading-none">
          <span className={`block text-[17px] font-bold tracking-tight ${light ? "text-white" : "text-navy-900"}`}>
            Onboard<span className={light ? "text-primary-200" : "text-primary-500"}>IQ</span>
          </span>
          <span className={`mt-1 block text-[10px] font-medium uppercase tracking-[0.12em] ${light ? "text-primary-200" : "text-slate-400"}`}>Employee Platform</span>
        </span>
      )}
    </span>
  );
}
