import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { employeeUser, hrUser, mockApi, renderApp, signedInRoutes } from "./helpers";

describe("protected routes", () => {
  it("blocks employees from the HR dashboard without calling HR APIs", async () => {
    const { requests } = mockApi(signedInRoutes(employeeUser));
    renderApp("/hr");

    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(screen.getByText("This page is only available to the HR team.")).toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith("/api/v1/hr"))).toBe(false);
  });

  it("blocks HR from the personal onboarding checklist", async () => {
    const { requests } = mockApi(signedInRoutes(hrUser));
    renderApp("/onboarding");

    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    expect(requests.some((r) => r.path === "/api/v1/onboarding/tasks")).toBe(false);
  });

  it("sends HR from the employee overview to the HR dashboard", async () => {
    mockApi(signedInRoutes(hrUser));
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "HR Dashboard" })).toBeInTheDocument();
  });

  it("redirects unknown paths home", async () => {
    mockApi(signedInRoutes(employeeUser));
    renderApp("/does-not-exist");
    expect(await screen.findByRole("heading", { name: /, Shreya$/ })).toBeInTheDocument();
  });

  it("shows role-appropriate navigation", async () => {
    mockApi(signedInRoutes(hrUser));
    renderApp("/settings");
    await screen.findByRole("heading", { name: "Settings" });

    for (const label of ["HR Dashboard", "Policy Assistant", "Documents", "Settings"]) {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My Onboarding" })).not.toBeInTheDocument();
  });
});
