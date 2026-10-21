import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StaffPortalLoadingSkeleton } from "./StaffPortalPage";

describe("Staff portal loading presentation", () => {
  it("matches the home content hierarchy instead of showing one empty pulse block", () => {
    const markup = renderToStaticMarkup(React.createElement(StaffPortalLoadingSkeleton));
    expect(markup).toContain("data-staff-portal-skeleton");
    expect(markup).toContain('aria-label="Loading Staff portal"');
    expect(markup).toContain("motion-reduce:animate-none");
    expect(markup).toContain("Record an operational incident");
    expect(markup).toContain("Awaiting review");
  });

  it("matches the report filters and table when that tab is active", () => {
    const markup = renderToStaticMarkup(React.createElement(StaffPortalLoadingSkeleton, { tab: "reports" }));
    expect(markup).toContain('aria-label="Loading Staff incident reports"');
    expect(markup).toContain("data-skeleton-table");
    expect(markup).toContain("My incident reports");
    expect(markup).toContain("Pending");
  });
});
