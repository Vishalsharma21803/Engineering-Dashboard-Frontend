import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";
import { ErrorCard, ErrorToast, PartialReadNotice, SectionView, StaleDataBanner } from "../components/feedback";
import { describeError } from "../utils/error-message";

describe("PartialReadNotice", () => {
  it("shows each non-empty message, in order, as a status note", () => {
    render(<PartialReadNotice messages={["First part was cut.", null, undefined, "", "  ", "Second part failed."]} />);
    const notice = screen.getByRole("status");
    expect(notice.querySelectorAll("p")).toHaveLength(2);
    expect(notice).toHaveTextContent("First part was cut.Second part failed.");
  });

  it("renders nothing when no message remains", () => {
    const { container } = render(<PartialReadNotice messages={[null, undefined, ""]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("SectionView", () => {
  it("explains a missing scope", () => {
    render(
      <SectionView section={{ status: "forbidden", data: null, reason: "AZURE_INSUFFICIENT_SCOPE" }} label="pipelines">
        {() => "data"}
      </SectionView>
    );
    expect(screen.getByText(/does not grant access to pipelines/)).toBeInTheDocument();
  });

  it("treats a successful empty read as data, not as a failure (no current iteration)", () => {
    render(
      <SectionView<{ name: string } | null> section={{ status: "ok", data: null, reason: null }} label="iterations">
        {(iteration) => iteration?.name ?? "None"}
      </SectionView>
    );
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
  });

  it("renders data when ok", () => {
    render(
      <SectionView section={{ status: "ok", data: [1, 2], reason: null }} label="items">
        {(data) => `count ${data.length}`}
      </SectionView>
    );
    expect(screen.getByText("count 2")).toBeInTheDocument();
  });
});

describe("describeError", () => {
  it("guides the user to fix an invalid PAT", () => {
    const description = describeError(new ApiError(424, "x", [], "AZURE_PAT_INVALID"));
    expect(description).toMatchObject({ title: "PAT rejected by Azure DevOps", fixCredential: true });
  });

  it("links to the credential from the error card", () => {
    render(
      <MemoryRouter>
        <ErrorCard error={new ApiError(424, "x", [], "AZURE_PAT_INVALID")} credentialId="abc" />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Update credential" })).toHaveAttribute("href", "/credentials/abc/edit");
  });
});

describe("StaleDataBanner", () => {
  it("says the data on screen is the last loaded and retries", async () => {
    const onRetry = vi.fn();
    render(<StaleDataBanner error={new ApiError(502, "Azure DevOps could not be reached.")} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not refresh");
    expect(screen.getByRole("alert")).toHaveTextContent("Showing the last loaded data.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("ErrorToast", () => {
  it("says what failed: a proposal by default, or the title it is given", () => {
    const { rerender } = render(<ErrorToast message="Azure DevOps could not be reached." onDismiss={() => undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not prepare the change");

    rerender(<ErrorToast title="Could not save your mark" message="The server did not answer." onDismiss={() => undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save your mark");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Could not prepare the change");
  });
});
