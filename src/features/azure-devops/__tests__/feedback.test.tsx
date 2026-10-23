import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api-client";
import { ErrorCard, SectionView } from "../components/feedback";
import { describeError } from "../utils/error-message";

describe("SectionView", () => {
  it("explains a missing scope", () => {
    render(
      <SectionView section={{ status: "forbidden", data: null, reason: "AZURE_INSUFFICIENT_SCOPE" }} label="pipelines">
        {() => "data"}
      </SectionView>
    );
    expect(screen.getByText(/does not grant access to pipelines/)).toBeInTheDocument();
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
