import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockBackend, renderWithProviders } from "@/test/render";
import { AiReviewSpeed } from "../components/ai-review-speed";

const timing = (models: unknown[]) => [{ path: "/api/ai/sop-check-timing", body: { timing: { days: 30, models } } }];

describe("AiReviewSpeed", () => {
  it("shows the chosen model's review time and warns when it is slow or rate limited", async () => {
    mockBackend(timing([{ provider: "OPENROUTER", model: "free/model", checks: 57, averageSeconds: 42, maxSeconds: 92, rateLimited: 6, failed: 0 }]));
    renderWithProviders(<AiReviewSpeed provider="OPENROUTER" model="free/model" />);

    expect(await screen.findByText(/take/)).toHaveTextContent("Ticket reviews with this model take 42 s on average (slowest 92 s, 57 reviews in the last 30 days). 6 waited on the provider's rate limit.");
    expect(screen.getByText(/This model is slow for ticket reviews/)).toBeInTheDocument();
  });

  it("says the review speed could not be loaded instead of showing nothing", async () => {
    mockBackend([{ path: "/api/ai/sop-check-timing", status: 500, body: { message: "Database unavailable" } }]);
    renderWithProviders(<AiReviewSpeed provider="OPENROUTER" model="free/model" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Review speed could not be loaded.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows nothing for a model with no reviews yet", async () => {
    mockBackend(timing([{ provider: "CLAUDE", model: "other", checks: 3, averageSeconds: 8, maxSeconds: 12, rateLimited: 0, failed: 0 }]));
    const { container } = renderWithProviders(<AiReviewSpeed provider="CLAUDE" model="claude-sonnet-5-5" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });
});
