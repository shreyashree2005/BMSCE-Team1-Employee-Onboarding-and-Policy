/**
 * Job roles offered at sign-up. Mirrors backend/app/data/job_roles.py (the API validates the value).
 * A job role shapes the onboarding checklist; it never grants access rights ("HR" here means working in HR).
 */
export const JOB_ROLES = [
  { value: "software_developer", label: "Software Developer" },
  { value: "ai_ml_engineer", label: "AI/ML Engineer" },
  { value: "data_analyst", label: "Data Analyst" },
  { value: "hr", label: "HR" },
  { value: "finance", label: "Finance" },
  { value: "sales", label: "Sales" },
  { value: "marketing", label: "Marketing" },
  { value: "intern", label: "Intern" },
  { value: "other", label: "Other" },
] as const;

export type JobRoleValue = (typeof JOB_ROLES)[number]["value"];
