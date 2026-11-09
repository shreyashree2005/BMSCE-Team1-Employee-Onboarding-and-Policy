import { useState } from "react";
import { Link } from "react-router-dom";
import { Compass, LifeBuoy, PlayCircle, Users } from "lucide-react";
import { COMPANY } from "../../config/company";
import { hrContact } from "../../config/support";
import { useGuidance } from "../../context/GuidanceContext";
import type { EmployeeProfile } from "../../types/dashboard";
import { SectionIllustration } from "../illustrations/SectionIllustration";
import { ContactHrModal } from "../support/ContactHrModal";
import { Button, buttonClasses } from "../ui/Button";
import { SectionHeader } from "../ui/SectionHeader";

/** Where to get help: the Help Desk, your people, and the guided tour / company introduction on demand. */
export function HelpSection({ employee }: { employee: EmployeeProfile }) {
  const { startTour, showCompanyIntro } = useGuidance();
  const [contactOpen, setContactOpen] = useState(false);
  const people = [
    { name: employee.manager, role: "Your manager" },
    { name: employee.buddy, role: "Onboarding buddy" },
    { name: hrContact.name, role: hrContact.title },
  ];

  return (
    <section aria-labelledby="help-heading" className="tint-blue rounded-panel border border-primary-100 p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <SectionIllustration name="helpdesk" className="hidden h-32 w-44 shrink-0 md:block" />
        <div className="min-w-0 flex-1">
          <SectionHeader id="help-heading" title="Help Desk" description="Stuck on a task, a login or a payroll question? Raise a ticket and track it until it's resolved." />
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/help" className={buttonClasses("primary", "sm")}>
              <LifeBuoy size={14} aria-hidden="true" />
              Raise a ticket
            </Link>
            <Button variant="secondary" size="sm" onClick={() => setContactOpen(true)}>
              <Users size={14} aria-hidden="true" />
              Contact HR
            </Button>
            <Button variant="ghost" size="sm" onClick={startTour}>
              <Compass size={14} aria-hidden="true" />
              Take the tour again
            </Button>
            <Button variant="ghost" size="sm" onClick={showCompanyIntro}>
              <PlayCircle size={14} aria-hidden="true" />
              Meet {COMPANY.name}
            </Button>
          </div>
        </div>
      </div>
      <ul className="mt-5 grid gap-2 border-t border-primary-100 pt-4 sm:grid-cols-3" aria-label="Your people">
        {people.map((person) => (
          <li key={person.role} className="flex min-w-0 items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-[13px] ring-1 ring-primary-100">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600" aria-hidden="true">
              <Users size={16} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold text-navy-900">{person.name}</span>
              <span className="block truncate text-xs text-primary-600">{person.role}</span>
            </span>
          </li>
        ))}
      </ul>
      <ContactHrModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </section>
  );
}
