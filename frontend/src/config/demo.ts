/**
 * "Today" used for due-date and overdue calculations. Defaults to the fixed demo date so the fictional data
 * looks the same whenever it is presented; it must match the backend's REFERENCE_DATE (both default to 2026-11-07).
 */
export const DEMO_TODAY = import.meta.env.VITE_REFERENCE_DATE ?? "2026-11-07";
