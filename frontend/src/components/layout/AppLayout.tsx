import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const COLLAPSE_STORAGE_KEY = "onboardiq.sidebarCollapsed";

function readCollapsedPreference(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);
  const { pathname } = useLocation();

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(collapsed));
    } catch {
      // Storage may be unavailable (private mode); the preference just won't persist.
    }
  }, [collapsed]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar
        mobileOpen={mobileNavOpen}
        collapsed={collapsed}
        onClose={() => setMobileNavOpen(false)}
        onToggleCollapsed={() => setCollapsed((prev) => !prev)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-7">
          {/* Keyed by route so each page fades in on navigation. */}
          <div key={pathname} className="mx-auto max-w-[1320px] animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
