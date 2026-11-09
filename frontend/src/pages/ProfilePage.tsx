import { useState } from "react";
import { PhotoPicker } from "../components/profile/PhotoPicker";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth, useCurrentUser } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ApiError } from "../services/apiClient";
import { deleteProfilePhoto, uploadProfilePhoto } from "../services/authApi";
import { formatLongDate, getInitials } from "../utils/format";

/** Your photo and employee record (details are managed by HR; personal details come from the profile task). */
export function ProfilePage() {
  const user = useCurrentUser();
  const { updateUser } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [first = "", ...rest] = user.fullName.split(" ");
  const profile = user.profile;

  const run = async (operation: () => Promise<typeof user>, success: string) => {
    setBusy(true);
    try {
      updateUser(await operation());
      showToast(success);
    } catch (caught) {
      showToast(caught instanceof ApiError ? caught.message : "Your photo couldn't be saved. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const rows = [
    { label: "Name", value: user.fullName },
    { label: "Work email", value: user.email },
    { label: "Access", value: user.role === "hr" ? "HR" : "Employee" },
    ...(profile
      ? [
          { label: "Job role", value: profile.jobRoleLabel ?? "—" },
          { label: "Job title", value: profile.jobTitle },
          { label: "Department", value: profile.department },
          { label: "Location", value: profile.location || "—" },
          { label: "Start date", value: formatLongDate(profile.startDate) },
          { label: "Manager", value: profile.managerName ?? "Not assigned yet" },
          { label: "Onboarding buddy", value: profile.buddyName ?? "Not assigned yet" },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="My Profile" description="Your photo and employee details." />
      <Card title="Profile photo">
        <PhotoPicker
          photoUrl={user.photoUrl}
          initials={getInitials(profile?.firstName ?? first, profile?.lastName ?? rest.join(" "))}
          busy={busy}
          onSelect={(file) => void run(() => uploadProfilePhoto(file), "Your profile photo was updated.")}
          onRemove={() => void run(deleteProfilePhoto, "Your profile photo was removed.")}
        />
      </Card>
      <Card title="Employee details" subtitle="Managed by your HR team" padding="none">
        <dl className="divide-y divide-line px-5 text-[13px] sm:px-6">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-4">
              <dt className="text-slate-500">{row.label}</dt>
              <dd className="font-medium text-navy-900 sm:text-right">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
