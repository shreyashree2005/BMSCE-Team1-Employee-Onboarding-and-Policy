import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CompanyIntro } from "../components/guidance/CompanyIntro";
import { WelcomeTour } from "../components/guidance/WelcomeTour";
import { updatePreferences } from "../services/authApi";
import { useAuth } from "./AuthContext";

type Step = "tour" | "intro" | null;

interface GuidanceContextValue {
  /** Replays the website tour (from Settings or the Help Desk). */
  startTour: () => void;
  /** Opens the company introduction again. */
  showCompanyIntro: () => void;
}

const GuidanceContext = createContext<GuidanceContextValue | null>(null);

// "Skip" without "Don't show this again" hides the guidance for this browser session only.
const SKIPPED_KEY = "onboardiq.guidanceSkipped";

function readSkipped(): Set<string> {
  try {
    return new Set(JSON.parse(window.sessionStorage.getItem(SKIPPED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function rememberSkipped(step: string) {
  try {
    window.sessionStorage.setItem(SKIPPED_KEY, JSON.stringify([...readSkipped(), step]));
  } catch {
    // Storage unavailable: the guidance may show again on the next page load, which is harmless.
  }
}

/**
 * First-visit guidance for employees: the website tour, then the company introduction. Whether each was finished
 * (or dismissed with "Don't show this again") is stored on the account, so it shows once per person, not per browser.
 */
export function GuidanceProvider({ children }: { children: ReactNode }) {
  const { user, updateUser } = useAuth();
  const [step, setStep] = useState<Step>(null);
  const [replaying, setReplaying] = useState(false);
  const decided = useRef(false);

  const firstPending = useCallback((): Step => {
    if (!user || user.role !== "employee") return null;
    const skipped = readSkipped();
    if (!user.tourCompleted && !skipped.has("tour")) return "tour";
    if (!user.companyIntroSeen && !skipped.has("intro")) return "intro";
    return null;
  }, [user]);

  useEffect(() => {
    if (decided.current || !user) return;
    decided.current = true;
    setStep(firstPending());
  }, [user, firstPending]);

  const persist = useCallback(
    async (preferences: { tourCompleted?: boolean; companyIntroSeen?: boolean }) => {
      try {
        updateUser(await updatePreferences(preferences));
      } catch {
        // Couldn't save (offline?): the guidance may show again next time, which is safe.
      }
    },
    [updateUser],
  );

  const afterTour = useCallback(() => {
    const showIntro = !replaying && user?.role === "employee" && !user.companyIntroSeen && !readSkipped().has("intro");
    setReplaying(false);
    setStep(showIntro ? "intro" : null);
  }, [replaying, user]);

  const finishTour = useCallback(() => {
    void persist({ tourCompleted: true });
    afterTour();
  }, [persist, afterTour]);

  const skipTour = useCallback(
    (dontShowAgain: boolean) => {
      if (dontShowAgain) void persist({ tourCompleted: true });
      else rememberSkipped("tour");
      afterTour();
    },
    [persist, afterTour],
  );

  const closeIntro = useCallback(() => {
    void persist({ companyIntroSeen: true });
    setStep(null);
  }, [persist]);

  const startTour = useCallback(() => {
    setReplaying(true);
    setStep("tour");
  }, []);
  const showCompanyIntro = useCallback(() => setStep("intro"), []);

  const value = useMemo(() => ({ startTour, showCompanyIntro }), [startTour, showCompanyIntro]);
  return (
    <GuidanceContext.Provider value={value}>
      {children}
      {step === "tour" && <WelcomeTour firstName={user?.profile?.firstName ?? user?.fullName.split(" ")[0] ?? ""} onFinish={finishTour} onSkip={skipTour} />}
      {step === "intro" && <CompanyIntro onClose={closeIntro} />}
    </GuidanceContext.Provider>
  );
}

export function useGuidance(): GuidanceContextValue {
  const context = useContext(GuidanceContext);
  if (!context) throw new Error("useGuidance must be used inside GuidanceProvider");
  return context;
}
