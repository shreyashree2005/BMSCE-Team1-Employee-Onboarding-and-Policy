/** One day of the onboarding calendar. Mirrors the API's CalendarDay (backend/app/schemas/onboarding.py). */
export interface CalendarDay {
  date: string;
  dayType: "working" | "weekly_off" | "company_holiday" | "festival_holiday";
  holidayName: string | null;
  taskIds: string[];
  /** Short heading, e.g. "Sunday — Weekly Holiday", "2 tasks scheduled", "All tasks completed". */
  title: string;
  /** Why nothing is left to do that day (null while tasks are still open), and where onboarding continues. */
  reason: string | null;
  /** Extra context for an empty working day. */
  note?: string | null;
  nextWorkingDay: string | null;
  nextActivityDate: string | null;
}

export interface OnboardingCalendar {
  today: string;
  weeklyOffDays: string[];
  days: CalendarDay[];
}
