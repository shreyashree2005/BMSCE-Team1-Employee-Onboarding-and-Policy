import { useEffect, type ReactNode } from "react";
import { BookOpenCheck, ClipboardCheck, ShieldCheck } from "lucide-react";
import { WelcomeHeroIllustration } from "../illustrations/SectionIllustration";
import { BrandWordmark } from "../ui/BrandMark";
import { fieldControlClass } from "../ui/formStyles";

const highlights = [
  { icon: ClipboardCheck, title: "A guided first month", text: "Every new hire sees their own checklist, deadlines and progress." },
  { icon: BookOpenCheck, title: "Answers from approved policy", text: "The Policy Assistant cites the documents HR has published." },
  { icon: ShieldCheck, title: "Role-based access", text: "Employees see only their own data. HR manages policies and progress." },
];

interface AuthLayoutProps {
  /** Browser tab title, e.g. "Sign in". */
  title: string;
  heading: string;
  subheading: string;
  children: ReactNode;
}

/** Split layout shared by the sign-in, sign-up and password pages: blue brand panel + the form on a white card. */
export function AuthLayout({ title, heading, subheading, children }: AuthLayoutProps) {
  useEffect(() => {
    document.title = `${title} · OnboardIQ`;
    return () => {
      document.title = "OnboardIQ";
    };
  }, [title]);

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-white via-white to-primary-50">
      <aside className="relative hidden w-[44%] max-w-[560px] flex-col justify-between overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 p-10 text-white lg:flex xl:p-12">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full border border-white/10" aria-hidden="true" />
        <div className="relative">
          <span className="inline-flex rounded-xl bg-white px-3 py-2">
            <BrandWordmark />
          </span>
        </div>
        <div className="relative space-y-7">
          <div className="rounded-2xl bg-white/95 p-3 shadow-[0_20px_40px_-20px_rgb(13_31_56/0.6)]">
            <WelcomeHeroIllustration className="h-44 w-full xl:h-52" />
          </div>
          <div>
            <p className="eyebrow text-primary-100">Employee onboarding</p>
            <p className="mt-3 text-[30px] font-semibold leading-tight tracking-tight">Everything a new hire needs, in one place.</p>
          </div>
          <ul className="space-y-5">
            {highlights.map(({ icon: Icon, title: itemTitle, text }) => (
              <li key={itemTitle} className="flex gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{itemTitle}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-white/80">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/70">Demo workspace · All people and data are fictional.</p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[440px] animate-fade-up">
          <div className="mb-6 flex justify-center lg:hidden">
            <BrandWordmark />
          </div>
          <div className="sm:rounded-2xl sm:border sm:border-line sm:bg-white sm:px-8 sm:py-9 sm:shadow-[0_1px_2px_rgb(27_63_140/0.05),0_20px_40px_-24px_rgb(31_90_214/0.28)]">
            <h1 className="text-[26px] font-bold tracking-tight text-primary-800">{heading}</h1>
            <p className="mt-1.5 text-[13.5px] text-slate-500">{subheading}</p>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Text input styling shared by the auth forms (the app-wide field style at the auth pages' height). */
export const authInputClass = `${fieldControlClass} h-11`;
