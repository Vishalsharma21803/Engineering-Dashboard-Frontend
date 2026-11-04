import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-text";

describe("errorMessage", () => {
  it("shows a known reason's server message as is", () => {
    expect(errorMessage(new ApiError(403, "Sign-up is by invitation only.", [], "SIGNUP_NOT_ALLOWED"), "x")).toBe("Sign-up is by invitation only.");
    expect(errorMessage(new ApiError(502, "Azure DevOps could not be reached: timeout", [], "AZURE_UPSTREAM_ERROR"), "x")).toBe("Azure DevOps could not be reached: timeout");
  });

  it("keeps a 5xx message and adds the status when there is no reason (no generic text)", () => {
    expect(errorMessage(new ApiError(500, "Something went wrong.", [], "INTERNAL_ERROR"), "fallback")).toBe("Something went wrong (HTTP 500)");
    expect(errorMessage(new ApiError(503, "Solidtime could not be reached", []), "fallback")).toBe("Solidtime could not be reached (HTTP 503)");
  });

  it("adds the status for an unknown reason, but not twice", () => {
    expect(errorMessage(new ApiError(418, "Odd", [], "SOMETHING_NEW"), "x")).toBe("Odd (HTTP 418)");
    expect(errorMessage(new ApiError(502, "Bad Gateway (HTTP 502)"), "x")).toBe("Bad Gateway (HTTP 502)");
  });

  it("falls back to fixed wording when a known reason comes without a message", () => {
    expect(errorMessage(new ApiError(403, "", [], "SIGNUP_NOT_ALLOWED"), "x")).toBe("Sign-up is by invitation only. Ask the Cockpit owner to add your email.");
  });

  it("explains network failures and keeps timeout texts", () => {
    expect(errorMessage(new ApiError(0, "Unable to reach the server", [], null, null, "network"), "x")).toBe("Unable to reach the server. Check your connection.");
    expect(errorMessage(new ApiError(0, "The server did not answer within 30 s.", [], null, null, "timeout"), "x")).toBe("The server did not answer within 30 s.");
  });

  it("uses other errors' own message, or the fallback", () => {
    expect(errorMessage(new Error("Boom"), "fallback")).toBe("Boom");
    expect(errorMessage("nope", "fallback")).toBe("fallback");
  });
});
