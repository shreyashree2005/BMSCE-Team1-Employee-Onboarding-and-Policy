/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the OnboardIQ FastAPI backend, e.g. http://localhost:8000 */
  readonly VITE_API_BASE_URL?: string;
  /** "true"/"false": list the fictional demo accounts on the sign-in page (default: only in development). */
  readonly VITE_SHOW_DEMO_ACCOUNTS?: string;
  /** Fixed "today" (YYYY-MM-DD) for due-date calculations; keep in sync with the backend's REFERENCE_DATE. */
  readonly VITE_REFERENCE_DATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
