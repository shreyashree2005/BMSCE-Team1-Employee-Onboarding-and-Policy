import { useEffect, useState } from "react";
import { useOnboarding } from "../context/OnboardingContext";
import { ApiError } from "../services/apiClient";
import { fetchOnboardingCalendar } from "../services/onboardingApi";
import type { OnboardingCalendar } from "../types/calendar";

/** The onboarding calendar from the API (weekends and company holidays come from the server's configuration). */
export function useOnboardingCalendar(days = 15) {
  const { tasks } = useOnboarding();
  const [calendar, setCalendar] = useState<OnboardingCalendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Refresh when any task's status changes: "next activity" depends on which tasks are still open.
  const statusKey = tasks.map((t) => `${t.id}:${t.status}`).join(",");

  useEffect(() => {
    const controller = new AbortController();
    fetchOnboardingCalendar(days, controller.signal)
      .then((loaded) => {
        setCalendar(loaded);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught instanceof ApiError ? caught.message : "The calendar couldn't be loaded.");
      });
    return () => controller.abort();
  }, [days, statusKey]);

  return { calendar, error };
}
