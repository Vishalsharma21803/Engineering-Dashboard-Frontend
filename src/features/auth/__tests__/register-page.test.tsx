import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";

import { mockBackend, renderWithProviders } from "@/test/render";
import { LoginPage } from "../pages/login-page";
import { RegisterPage } from "../pages/register-page";

const user = { id: "u1", name: "Ada", email: "ada@example.com" };

function App() {
  return (
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
    </Routes>
  );
}

async function register() {
  renderWithProviders(<App />, { path: "*", route: "/register" });
  await userEvent.type(screen.getByLabelText("Name"), "Ada");
  await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "correct horse");
  await userEvent.type(screen.getByLabelText("Confirm password"), "correct horse");
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("RegisterPage", () => {
  it("says why signing in right after registering failed", async () => {
    mockBackend([
      { method: "POST", path: "/api/auth/register", status: 201, body: { message: "Registered", user } },
      { method: "POST", path: "/api/auth/login", status: 429, body: { message: "Too many sign-in attempts. Try again in 15 minutes.", reason: "TOO_MANY_REQUESTS" } },
    ]);
    await register();

    expect(
      await screen.findByText("Account created, but signing you in failed: Too many sign-in attempts. Try again in 15 minutes. Sign in below.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("explains invite-only sign-up", async () => {
    mockBackend([
      {
        method: "POST",
        path: "/api/auth/register",
        status: 403,
        body: { message: "Sign-up is by invitation only. Ask the Cockpit owner to add your email.", reason: "SIGNUP_NOT_ALLOWED" },
      },
    ]);
    await register();

    expect(await screen.findByRole("alert")).toHaveTextContent("Sign-up is by invitation only. Ask the Cockpit owner to add your email.");
  });
});
