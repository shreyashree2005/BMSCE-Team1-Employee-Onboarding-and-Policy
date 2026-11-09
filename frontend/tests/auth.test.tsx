import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { employeeUser, hrUser, mockApi, renderApp, signedInRoutes } from "./helpers";

const PASSWORD = "correct-password";

function loginRoutes() {
  let signedInAs: typeof employeeUser | null = null;
  const routes = {
    "GET /api/v1/auth/me": () => (signedInAs ? { body: signedInAs } : { status: 401, body: { detail: "Not authenticated. Please sign in." } }),
    "POST /api/v1/auth/login": (request: { body: unknown }) => {
      const { email, password } = request.body as { email: string; password: string };
      const user = [employeeUser, hrUser].find((u) => u.email === email);
      if (!user || password !== PASSWORD) return { status: 401, body: { detail: "Incorrect email or password." } };
      signedInAs = user;
      return { body: { user, expiresAt: "2026-11-07T20:00:00Z" } };
    },
  };
  return { routes, signedInAs: () => signedInAs };
}

async function signIn(email: string, password = PASSWORD) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Work email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  return user;
}

describe("authentication flow", () => {
  it("sends signed-out visitors to the sign-in page", async () => {
    mockApi(loginRoutes().routes);
    renderApp("/onboarding");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("signs an employee in and opens their personal overview", async () => {
    const { routes } = loginRoutes();
    const { requests } = mockApi({ ...signedInRoutes(employeeUser), ...routes });
    renderApp("/login");

    await signIn(employeeUser.email);

    expect(await screen.findByRole("heading", { name: /, Shreya$/ })).toBeInTheDocument();
    const login = requests.find((r) => r.path === "/api/v1/auth/login");
    expect(login?.body).toEqual({ email: employeeUser.email, password: PASSWORD });
    expect(login?.headers["x-requested-with"]).toBe("OnboardIQ");
    // Employees don't get HR navigation.
    expect(screen.queryByRole("link", { name: "HR Dashboard" })).not.toBeInTheDocument();
  });

  it("signs HR in and lands on the HR dashboard", async () => {
    const { routes } = loginRoutes();
    mockApi({ ...signedInRoutes(hrUser), ...routes });
    renderApp("/login");

    await signIn(hrUser.email);

    expect(await screen.findByRole("heading", { name: "HR Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My Onboarding" })).not.toBeInTheDocument();
  });

  it("shows the server's error for wrong credentials and clears the password", async () => {
    mockApi(loginRoutes().routes);
    renderApp("/login");

    await signIn(employeeUser.email, "wrong-password");

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("validates empty fields before calling the API", async () => {
    const { requests } = mockApi(loginRoutes().routes);
    renderApp("/login");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /sign in/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter your email address and password.");
    expect(requests.some((r) => r.path === "/api/v1/auth/login")).toBe(false);
  });

  it("returns to the originally requested page after signing in", async () => {
    const { routes } = loginRoutes();
    mockApi({ ...signedInRoutes(employeeUser), ...routes });
    renderApp("/settings");

    await signIn(employeeUser.email);

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });

  it("restores the session after a page refresh", async () => {
    mockApi(signedInRoutes(employeeUser));
    renderApp("/settings");
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getAllByText(employeeUser.email).length).toBeGreaterThan(0);
  });

  it("signs out and returns to the sign-in page", async () => {
    const { requests } = mockApi(signedInRoutes(employeeUser));
    renderApp("/settings");
    const user = userEvent.setup();
    const session = await screen.findByText("Session");
    await user.click(within(session.closest("section") ?? document.body).getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(requests.some((r) => r.method === "POST" && r.path === "/api/v1/auth/logout")).toBe(true);
  });

  it("after an explicit sign-out, the next user starts on their own home page", async () => {
    const { routes } = loginRoutes();
    // Employee checklist + HR endpoints both available; /auth/me and /login follow whoever is signed in.
    mockApi({ ...signedInRoutes(hrUser), "GET /api/v1/onboarding/tasks": signedInRoutes(employeeUser)["GET /api/v1/onboarding/tasks"], ...routes });
    renderApp("/login");
    await signIn(employeeUser.email);
    await screen.findByRole("heading", { name: /, Shreya$/ });

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("link", { name: "Documents" })[0]);
    await screen.findByRole("heading", { name: "Policy Documents" });
    await user.click(screen.getByRole("button", { name: "Open profile menu" }));
    await user.click(await screen.findByRole("button", { name: "Logout" }));
    await screen.findByRole("heading", { name: "Sign in" });

    await signIn(hrUser.email);
    expect(await screen.findByRole("heading", { name: "HR Dashboard" })).toBeInTheDocument();
  });

  it("returns to sign-in with a notice when the session expires mid-use", async () => {
    let expired = false;
    mockApi({
      ...signedInRoutes(employeeUser),
      "GET /api/v1/auth/me": () => (expired ? { status: 401 } : { body: employeeUser }),
      "GET /api/v1/policies/documents": () => (expired ? { status: 401, body: { detail: "Your session has expired" } } : { body: [] }),
    });
    renderApp("/settings");
    await screen.findByRole("heading", { name: "Settings" });

    expired = true;
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("link", { name: "Documents" })[0]);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Your session has ended");
  });

  it("explains when the server can't be reached and retries", async () => {
    let up = false;
    mockApi({
      ...signedInRoutes(employeeUser),
      "GET /api/v1/auth/me": () => (up ? { body: employeeUser } : { status: 503, body: { detail: "down" } }),
    });
    renderApp("/settings");

    expect(await screen.findByText("Can't reach OnboardIQ")).toBeInTheDocument();
    up = true;
    await userEvent.setup().click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument());
  });
});
