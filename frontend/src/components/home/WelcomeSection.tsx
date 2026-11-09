import { Briefcase, CalendarDays, MapPin } from "lucide-react";
import { COMPANY } from "../../config/company";
import { DEMO_TODAY } from "../../config/demo";
import type { EmployeeProfile } from "../../types/dashboard";
import { daysBetween, formatLongDate, getGreeting, pluralize } from "../../utils/format";
import { WelcomeHeroIllustration } from "../illustrations/SectionIllustration";

interface WelcomeSectionProps {
  employee: EmployeeProfile;
  jobRole: string;
  remaining: number;
  total: number;
}

/** Warm, simple greeting: who you are, where you are in onboarding, in one sentence, beside the welcome illustration. */
export function WelcomeSection({ employee, jobRole, remaining, total }: WelcomeSectionProps) {
  const day = daysBetween(employee.startDate, DEMO_TODAY) + 1;
  const status =
    remaining === 0
      ? "You've finished onboarding. Welcome to the team!"
      : day < 1
        ? `You start on ${formatLongDate(employee.startDate)}. You can get a head start on ${pluralize(remaining, "task")} now.`
        : `You have ${pluralize(remaining, "task")} left out of ${total}. We'll guide you one step at a time.`;
  const chips = [
    { icon: Briefcase, label: jobRole },
    ...(employee.location ? [{ icon: MapPin, label: employee.location }] : []),
    { icon: CalendarDays, label: day >= 1 ? `Day ${day}` : `Starts ${formatLongDate(employee.startDate)}` },
  ];

  return (
    <section
      aria-labelledby="welcome-heading"
      className="relative overflow-hidden rounded-panel border border-primary-100 bg-gradient-to-br from-primary-200/70 via-primary-50 to-white shadow-card"
    >
      {/* soft decorative shapes */}
      <span className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-white/60 blur-2xl" aria-hidden="true" />
      <span className="pointer-events-none absolute -bottom-24 right-1/3 h-48 w-48 rounded-full bg-primary-200/40 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col-reverse items-center gap-2 px-6 py-6 sm:px-8 md:flex-row md:justify-between md:gap-6 md:py-7">
        <div className="w-full min-w-0 md:max-w-[56%]">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[12px] font-semibold text-primary-700 ring-1 ring-primary-100">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-500" aria-hidden="true" />
            Welcome to {COMPANY.name}
          </p>
          <h1 id="welcome-heading" className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-primary-800 sm:text-[34px]">
            {getGreeting()}, <span className="text-primary-500">{employee.firstName}</span>
          </h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-slate-600">{status}</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {chips.map(({ icon: Icon, label }) => (
              <li key={label} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-600 shadow-card ring-1 ring-primary-100">
                <Icon size={14} className="text-primary-500" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <WelcomeHeroIllustration className="h-44 w-full max-w-[300px] shrink-0 sm:h-52 sm:max-w-[340px] lg:h-56 lg:max-w-[380px]" />
      </div>
    </section>
  );
}
