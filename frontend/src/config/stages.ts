import type { LucideIcon } from "lucide-react";
import { DoorOpen, FileCheck, GraduationCap, Rocket, Wallet } from "lucide-react";
import type { OnboardingStageName } from "../types/dashboard";

export const STAGE_ORDER: OnboardingStageName[] = ["Welcome", "Documentation", "Payroll & Benefits", "Training", "Ready to Go"];

export const stageMeta: Record<OnboardingStageName, { icon: LucideIcon; description: string }> = {
  Welcome: { icon: DoorOpen, description: "Get set up, meet your team and settle in." },
  Documentation: { icon: FileCheck, description: "Sign agreements and submit your personal records." },
  "Payroll & Benefits": { icon: Wallet, description: "Set up salary payments and choose your benefits." },
  Training: { icon: GraduationCap, description: "Complete mandatory compliance and security training." },
  "Ready to Go": { icon: Rocket, description: "Set goals and complete your first deliverables." },
};
