import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { passwordRules } from "../src/utils/validation";
import type { AuthUser } from "../src/types/auth";
import { mockApi, renderApp, signedInRoutes, type RecordedRequest } from "./helpers";

const STRONG = "Harbour-Lights-42";

const newUser: AuthUser = {
  id: 42,
  email: "arjun.mehta@example.com",
  fullName: "Arjun Mehta",
  role: "employee",
  profile: { firstName: "Arjun", lastName: "Mehta", jobTitle: "New hire", department: "Unassigned", location: "", startDate: "2026-11-07", managerName: null, buddyName: null },
};

function registrationApi(result: (request: RecordedRequest) => { status?: number; body?: unknown } = () => ({ status: 201, body: { user: newUser, expiresAt: "2026-11-07T20:00:00Z" } })) {
  let signedIn = false;
  return mockApi({
    ...signedInRoutes(newUser),
    "GET /api/v1/auth/me": () => (signedIn ? { body: newUser } : { status: 401, body: { detail: "Not authenticated. Please sign in." } }),
    "POST /api/v1/auth/register": (request) => {
      const response = result(request);
      if ((response.status ?? 200) < 300) signedIn = true;
      return response;
    },
  });
}

async function fillForm(values: Partial<Record<"first" | "middle" | "last" | "email" | "password" | "confirm" | "role", string>> = {}) {
  const user = userEvent.setup();
  const { first = "Arjun", middle = "", last = "Mehta", email = "arjun.mehta@example.com", password = STRONG, confirm = password, role = "Data Analyst" } = values;
  if (first) await user.type(await screen.findByLabelText("First name"), first);
  if (middle) await user.type(screen.getByLabelText("Middle name (optional)"), middle);
  if (last) await user.type(screen.getByLabelText("Last name"), last);
  if (email) await user.type(screen.getByLabelText("Work email"), email);
  if (role) await user.selectOptions(screen.getByLabelText("Job role"), role);
  if (password) await user.type(screen.getByLabelText("Password"), password);
  if (confirm) await user.type(screen.getByLabelText("Confirm password"), confirm);
  return user;
}

const submit = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Create account" }));

describe("employee registration", () => {
  it("links between Sign In and Sign Up", async () => {
    registrationApi();
    renderApp("/login");
    const user = userEvent.setup();

    expect(await screen.findByText(/Don't have an account\?/)).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Sign Up" }));
    expect(await screen.findByRole("heading", { name: "Sign up" })).toBeInTheDocument();
    expect(screen.getByText(/Already have an account\?/)).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Sign In" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("has first, middle (optional) and last name fields, and no account type or profile photo sections", async () => {
    registrationApi();
    renderApp("/register");
    expect(await screen.findByLabelText("First name")).toBeRequired();
    expect(screen.getByLabelText("Middle name (optional)")).not.toBeRequired();
    expect(screen.getByLabelText("Last name")).toBeRequired();
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Account type" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByText(/Profile photo/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upload photo/ })).not.toBeInTheDocument();
  });

  it("combines first, middle and last name, and sends no role", async () => {
    const { requests } = registrationApi();
    renderApp("/register");
    const user = await fillForm({ first: " Arjun ", middle: "Kumar", last: "Mehta" });
    expect(screen.getByText("Your name will appear as “Arjun Kumar Mehta”.")).toBeInTheDocument();
    await submit(user);
    await screen.findByRole("heading", { name: /, Arjun$/ });
    const request = requests.find((r) => r.path === "/api/v1/auth/register");
    expect(request?.body).toEqual({ firstName: "Arjun", middleName: "Kumar", lastName: "Mehta", email: "arjun.mehta@example.com", password: STRONG, confirmPassword: STRONG, jobRole: "data_analyst" });
    expect(Object.keys(request?.body as object)).not.toContain("role");
  });

  it("creates the account, signs the user in and opens their overview", async () => {
    const { requests } = registrationApi();
    renderApp("/register");

    const user = await fillForm({ first: "  Arjun ", last: " Mehta " });
    await submit(user);

    expect(await screen.findByRole("heading", { name: /, Arjun$/ })).toBeInTheDocument();
    // A first-time user gets the guided tour.
    expect(screen.getByRole("dialog", { name: "Welcome to Dayforce, Arjun!" })).toBeInTheDocument();
    expect(screen.getByText(/Your account and onboarding checklist are ready/)).toBeInTheDocument();

    const request = requests.find((r) => r.path === "/api/v1/auth/register");
    // No middle name: sent as null, never as a missing or undefined required field.
    expect(request?.body).toEqual({ firstName: "Arjun", middleName: null, lastName: "Mehta", email: "arjun.mehta@example.com", password: STRONG, confirmPassword: STRONG, jobRole: "data_analyst" });
    expect(request?.headers["x-requested-with"]).toBe("OnboardIQ");
    expect(request?.credentials).toBe("include");
    expect(Object.keys(request?.body as object)).not.toContain("role");
  });

  it("requires every field and doesn't call the API", async () => {
    const { requests } = registrationApi();
    renderApp("/register");
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Sign up" });

    await submit(user);

    expect(screen.getByText("Enter your work email.")).toBeInTheDocument();
    expect(screen.getByText("Create a password.")).toBeInTheDocument();
    expect(screen.getByText("Confirm your password.")).toBeInTheDocument();
    expect(screen.getByText("Choose your job role.")).toBeInTheDocument();
    expect(screen.getByText("Enter your first name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your last name.")).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toHaveFocus();
    expect(requests.some((r) => r.path === "/api/v1/auth/register")).toBe(false);
  });

  it("requires a job role and explains it doesn't grant HR access", async () => {
    const { requests } = registrationApi();
    renderApp("/register");
    const user = await fillForm({ role: "" });

    expect(screen.getByText(/Choosing “HR” doesn't grant HR access/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "AI/ML Engineer" })).toBeInTheDocument();
    await submit(user);

    expect(screen.getByText("Choose your job role.")).toBeInTheDocument();
    expect(screen.getByLabelText("Job role")).toHaveFocus();
    expect(requests.some((r) => r.path === "/api/v1/auth/register")).toBe(false);
  });

  it("validates email format, name characters and password confirmation", async () => {
    const { requests } = registrationApi();
    renderApp("/register");
    const user = await fillForm({ last: "", middle: "K2", email: "arjun@nowhere", confirm: "Harbour-Lights-43" });

    await submit(user);

    expect(screen.getByText("Enter your last name.")).toBeInTheDocument();
    expect(screen.getByText("Use letters only (spaces, hyphens and apostrophes are fine).")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address, like name@company.com.")).toBeInTheDocument();
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveAttribute("aria-invalid", "true");
    expect(requests.some((r) => r.path === "/api/v1/auth/register")).toBe(false);
  });

  it("shows live password requirements and blocks weak passwords", async () => {
    const { requests } = registrationApi();
    renderApp("/register");
    const user = await fillForm({ password: "weakpass" });

    const list = screen.getByRole("list", { name: "Password requirements" });
    expect(within(list).getByText(/A lowercase letter/)).toHaveTextContent("(met)");
    expect(within(list).getByText(/An uppercase letter/)).toHaveTextContent("(not met)");
    expect(within(list).getByText(/A number/)).toHaveTextContent("(not met)");

    await submit(user);
    expect(screen.getByText("Choose a stronger password that meets every requirement below.")).toBeInTheDocument();
    expect(requests.some((r) => r.path === "/api/v1/auth/register")).toBe(false);
  });

  it("explains a duplicate email and offers to sign in instead", async () => {
    registrationApi(() => ({ status: 409, body: { detail: "An account with this email already exists. Sign in instead, or use a different email." } }));
    renderApp("/register");
    const user = await fillForm({ email: "shreya.nambiar@onboardiq-demo.example" });

    await submit(user);

    expect(await screen.findByText("An account with this email already exists.")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveFocus();
    await user.click(screen.getByRole("link", { name: "Sign in instead" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveValue("shreya.nambiar@onboardiq-demo.example");
  });

  it("shows server validation and rate-limit messages", async () => {
    registrationApi(() => ({ status: 429, body: { detail: "Too many sign-up attempts from this network. Please try again later." } }));
    renderApp("/register");
    const user = await fillForm();

    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many sign-up attempts");
    expect(screen.getByRole("heading", { name: "Sign up" })).toBeInTheDocument();
  });

  it("shows a server check without a field name under the field it's about, without Pydantic's prefix", async () => {
    registrationApi(() => ({ status: 422, body: { detail: [{ msg: "Value error, Passwords don't match", loc: ["body"] }] } }));
    renderApp("/register");
    const user = await fillForm();
    await submit(user);
    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(/Value error/)).not.toBeInTheDocument();
  });

  it("puts server field errors under the right field and clears each one when that field is edited", async () => {
    registrationApi(() => ({ status: 422, body: { detail: [{ loc: ["body"], msg: "Value error, Enter your last name using letters only" }] } }));
    renderApp("/register");
    const user = await fillForm({ first: "Ravi", middle: "Shankar", last: "N C" });
    await submit(user);
    expect(await screen.findByText("Enter your last name using letters only")).toBeInTheDocument();
    expect(screen.getByLabelText("Last name")).toHaveFocus();
    await user.type(screen.getByLabelText("Last name"), "a");
    expect(screen.queryByText("Enter your last name using letters only")).not.toBeInTheDocument();
  });

  it("never shows an unexplained 'Field required': an older server's field errors are named", async () => {
    // The exact response an older backend (single fullName field) gives to this form's request.
    registrationApi(() => ({
      status: 422,
      body: {
        detail: [
          { loc: ["body", "fullName"], msg: "Field required", type: "missing" },
          { loc: ["body", "firstName"], msg: "Extra inputs are not permitted", type: "extra_forbidden" },
          { loc: ["body", "middleName"], msg: "Extra inputs are not permitted", type: "extra_forbidden" },
          { loc: ["body", "lastName"], msg: "Extra inputs are not permitted", type: "extra_forbidden" },
        ],
      },
    }));
    renderApp("/register");
    const user = await fillForm({ first: "Ravi", middle: "Shankar", last: "N C" });
    await submit(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("full name: This field is required");
    expect(alert).toHaveTextContent(/older version of OnboardIQ/);
    expect(screen.queryByText(/^Field required$/)).not.toBeInTheDocument();
    // The form's own fields are flagged too, with a readable message.
    expect(screen.getAllByText("The server doesn't accept this field.")).toHaveLength(3);
  });

  it("registers Ravi Shankar N C with Job role HR as an Employee account (no role sent)", async () => {
    const { requests } = registrationApi();
    renderApp("/register");
    const user = await fillForm({ first: "  Ravi ", middle: " Shankar ", last: " N  C ", email: " ravi.nc@example.com ", role: "HR" });
    expect(screen.getByText("Your name will appear as “Ravi Shankar N C”.")).toBeInTheDocument();
    await submit(user);
    await waitFor(() => expect(requests.some((r) => r.path === "/api/v1/auth/register")).toBe(true));
    const body = requests.find((r) => r.path === "/api/v1/auth/register")?.body as Record<string, unknown>;
    expect(body).toEqual({ firstName: "Ravi", middleName: "Shankar", lastName: "N C", email: "ravi.nc@example.com", password: STRONG, confirmPassword: STRONG, jobRole: "hr" });
    expect(body).not.toHaveProperty("role");
  });

  it("sends signed-in users away from the registration page", async () => {
    mockApi(signedInRoutes(newUser));
    renderApp("/register");
    expect(await screen.findByRole("heading", { name: /, Arjun$/ })).toBeInTheDocument();
  });
});

describe("password rules (mirror of the API policy)", () => {
  it("accepts a strong password and rejects personal or common ones", () => {
    expect(passwordRules(STRONG).every((rule) => rule.met)).toBe(true);
    expect(passwordRules("ArjunRocks2026", "arjun@example.com", "Arjun Mehta").find((r) => r.id === "personal")?.met).toBe(false);
    expect(passwordRules("Password12345").find((r) => r.id === "personal")?.met).toBe(false);
    expect(passwordRules("Short1A").find((r) => r.id === "length")?.met).toBe(false);
  });
});
