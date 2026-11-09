import type { LucideIcon } from "lucide-react";
import { CalendarDays, ClipboardCheck, HeartPulse, House, Scale, ShieldCheck, Wallet } from "lucide-react";
import type { PolicyCategory } from "../types/policyAssistant";

export const policyCategoryIcons: Record<PolicyCategory, LucideIcon> = {
  Leave: CalendarDays,
  Benefits: HeartPulse,
  Payroll: Wallet,
  Onboarding: ClipboardCheck,
  "Hybrid Work": House,
  "IT & Security": ShieldCheck,
  Conduct: Scale,
};
