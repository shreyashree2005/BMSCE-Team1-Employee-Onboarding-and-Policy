import type { HrContact } from "../types/dashboard";

/**
 * Organisation-wide HR support contact shown to employees. Static directory information for the demo
 * workspace (fictional, not a real person or phone line); it is not per-user data.
 */
export const hrContact: HrContact = {
  team: "People Operations",
  name: "Kavya Rao",
  title: "HR Business Partner",
  email: "people.ops@onboardiq-demo.example",
  phone: "+91 80 4000 2040",
  hours: "Mon–Fri, 9:00 AM – 6:00 PM IST",
};
