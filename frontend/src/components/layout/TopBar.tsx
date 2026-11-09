import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ChevronRight, Menu, Search, X } from "lucide-react";
import { navItems } from "../../config/navigation";
import { BrandMark } from "../ui/BrandMark";
import { DemoBadge } from "../ui/DemoBadge";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationMenu } from "./NotificationMenu";
import { ProfileMenu } from "./ProfileMenu";

const iconButton = "focus-ring flex h-10 w-10 items-center justify-center rounded-xl text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700";

export function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const { pathname } = useLocation();
  const current = navItems.find((item) => item.path === pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-primary-100 bg-white/90 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:h-[72px] sm:px-6 lg:px-8">
        <button type="button" onClick={onMenuClick} className={`${iconButton} lg:hidden`} aria-label="Open navigation menu">
          <Menu size={20} aria-hidden="true" />
        </button>
        <span className="lg:hidden">
          <BrandMark size={30} />
        </span>

        {current && (
          <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-[13px] lg:flex">
            <span className="text-slate-400">{current.section}</span>
            <ChevronRight size={14} className="text-primary-300" aria-hidden="true" />
            <span className="font-semibold text-primary-700" aria-current="page">
              {current.label}
            </span>
          </nav>
        )}

        <div className="ml-auto hidden w-full max-w-sm md:block">
          <GlobalSearch shortcut />
        </div>

        <div className="ml-auto flex items-center gap-1 md:ml-2">
          <span className="mr-1 hidden xl:inline-flex">
            <DemoBadge label="Demo workspace" />
          </span>
          <button
            type="button"
            onClick={() => setMobileSearchOpen((prev) => !prev)}
            className={`${iconButton} md:hidden`}
            aria-label={mobileSearchOpen ? "Close search" : "Open search"}
            aria-expanded={mobileSearchOpen}
          >
            {mobileSearchOpen ? <X size={19} aria-hidden="true" /> : <Search size={19} aria-hidden="true" />}
          </button>
          <NotificationMenu />
          <span className="ml-2 sm:ml-3">
            <ProfileMenu />
          </span>
        </div>
      </div>

      {mobileSearchOpen && (
        <div className="animate-fade-in border-t border-line px-4 py-3 md:hidden">
          <GlobalSearch autoFocus onNavigate={() => setMobileSearchOpen(false)} />
        </div>
      )}
    </header>
  );
}
