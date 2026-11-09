import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { RequireAuth, RequireRole, RoleHome } from "./components/auth/RouteGuards";
import { AppLayout } from "./components/layout/AppLayout";
import { useCurrentUser } from "./context/AuthContext";
import { OnboardingProvider } from "./context/OnboardingContext";
import { TaskCelebration } from "./components/tasks/TaskCelebration";
import { GuidanceProvider } from "./context/GuidanceContext";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { HrDashboardPage } from "./pages/HrDashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { MyOnboardingPage } from "./pages/MyOnboardingPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PolicyAssistantPage } from "./pages/PolicyAssistantPage";
import { PolicyDocumentsPage } from "./pages/PolicyDocumentsPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { HelpDeskPage } from "./pages/HelpDeskPage";

/** Per-user data providers. Keyed by user ID so signing in as someone else starts from a clean slate. */
function SignedInShell() {
  const user = useCurrentUser();
  return (
    <OnboardingProvider key={user.id} enabled={user.role === "employee"}>
      <GuidanceProvider>
        <AppLayout />
        <TaskCelebration />
      </GuidanceProvider>
    </OnboardingProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<SignedInShell />}>
          <Route index element={<RoleHome employee={<OverviewPage />} />} />
          <Route element={<RequireRole roles={["employee"]} />}>
            <Route path="/onboarding" element={<MyOnboardingPage />} />
          </Route>
          <Route element={<RequireRole roles={["hr"]} />}>
            <Route path="/hr" element={<HrDashboardPage />} />
          </Route>
          <Route element={<Outlet />}>
            <Route path="/policy-assistant" element={<PolicyAssistantPage />} />
            <Route path="/documents" element={<PolicyDocumentsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/help" element={<HelpDeskPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
