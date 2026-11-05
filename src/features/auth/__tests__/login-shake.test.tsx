import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";

import { mockBackend, renderWithProviders } from "@/test/render";
import { LoginPage } from "../pages/login-page";

async function signIn(status: number, body: Record<string, unknown>) {
  mockBackend([{ method: "POST", path: "/api/auth/login", status, body }]);
  const { container } = renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
    </Routes>,
    { path: "*", route: "/login" }
  );
  await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "wrong password");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("alert");
  return container;
}

describe("LoginPage shake", () => {
  it("shakes the card once on a refused sign-in and keeps what was typed", async () => {
    const container = await signIn(401, { message: "Invalid email or password", reason: "INVALID_CREDENTIALS" });
    expect(container.querySelector(".auth-shake")).not.toBeNull();
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("does not shake when the server failed rather than refused", async () => {
    const container = await signIn(500, { message: "Signing in failed because of an unexpected server error.", reason: "INTERNAL_ERROR" });
    expect(container.querySelector(".auth-shake")).toBeNull();
  });
});
