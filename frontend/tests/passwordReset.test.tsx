import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, renderApp } from "./helpers";

const GENERIC = "If an account exists for that email, we've sent a password reset link.";
const NEW_PASSWORD = "Harbour-Lights-42";
const signedOut = { "GET /api/v1/auth/me": () => ({ status: 401, body: { detail: "Not authenticated. Please sign in." } }) };

describe("forgot password", () => {
  it("is linked from sign-in and requests a reset link for the registered email", async () => {
    const { requests } = mockApi({ ...signedOut, "POST /api/v1/auth/forgot-password": () => ({ status: 202, body: { message: GENERIC } }) });
    renderApp("/login");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("link", { name: "Forgot password?" }));
    expect(await screen.findByRole("heading", { name: "Reset your password" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(screen.getByText("Enter your work email.")).toBeInTheDocument();
    expect(requests.some((r) => r.path === "/api/v1/auth/forgot-password")).toBe(false);

    await user.type(screen.getByLabelText("Registered email"), "arjun.mehta@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText(new RegExp(GENERIC.replace(/[.']/g, ".")))).toBeInTheDocument();
    const request = requests.find((r) => r.path === "/api/v1/auth/forgot-password");
    expect(request?.body).toEqual({ email: "arjun.mehta@example.com" });
    expect(request?.headers["x-requested-with"]).toBe("OnboardIQ");
  });

  it("shows the rate-limit error from the server", async () => {
    mockApi({ ...signedOut, "POST /api/v1/auth/forgot-password": () => ({ status: 429, body: { detail: "Too many reset requests. Please try again later." } }) });
    renderApp("/forgot-password");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Registered email"), "arjun.mehta@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many reset requests. Please try again later.");
  });
});

describe("reset password", () => {
  it("verifies the link, sets the new password and returns to sign-in with a confirmation", async () => {
    const { requests } = mockApi({
      ...signedOut,
      "POST /api/v1/auth/reset-password/verify": () => ({ body: { valid: true, emailHint: "a***@example.com" } }),
      "POST /api/v1/auth/reset-password": () => ({ body: { message: "Your password has been reset." } }),
    });
    renderApp("/reset-password?token=abc123");
    const user = userEvent.setup();

    expect(await screen.findByText("Resetting the password for a***@example.com.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("New password"), "weakpass");
    await user.type(screen.getByLabelText("Confirm new password"), "weakpass");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(screen.getByText("Choose a stronger password that meets every requirement below.")).toBeInTheDocument();
    expect(requests.some((r) => r.path === "/api/v1/auth/reset-password")).toBe(false);

    await user.clear(screen.getByLabelText("New password"));
    await user.clear(screen.getByLabelText("Confirm new password"));
    await user.type(screen.getByLabelText("New password"), NEW_PASSWORD);
    await user.type(screen.getByLabelText("Confirm new password"), NEW_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Your password has been reset. Sign in with your new password.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(requests.find((r) => r.path === "/api/v1/auth/reset-password")?.body).toEqual({ token: "abc123", password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
  });

  it("explains an expired or already-used link and offers a new one", async () => {
    mockApi({ ...signedOut, "POST /api/v1/auth/reset-password/verify": () => ({ body: { valid: false, emailHint: null } }) });
    renderApp("/reset-password?token=used");

    expect(await screen.findByRole("alert")).toHaveTextContent("This reset link is invalid or has expired.");
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  it("handles a link that expires while the form is open", async () => {
    mockApi({
      ...signedOut,
      "POST /api/v1/auth/reset-password/verify": () => ({ body: { valid: true, emailHint: null } }),
      "POST /api/v1/auth/reset-password": () => ({ status: 400, body: { detail: "This reset link is invalid or has expired. Request a new one." } }),
    });
    renderApp("/reset-password?token=abc");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("New password"), NEW_PASSWORD);
    await user.type(screen.getByLabelText("Confirm new password"), NEW_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("invalid or has expired"));
    expect(screen.getByRole("link", { name: "Request a new link" })).toBeInTheDocument();
  });
});
