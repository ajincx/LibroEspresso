import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CurrentAccessCard, managerNav, ownerNav, SYSTEM_INFO_OVERLAY_CLASS, SYSTEM_INFO_PANEL_CLASS } from "./AppChrome";

describe("approved management navigation", () => {
  it("does not expose a standalone Management Analytics item", () => {
    const entries = [...ownerNav, ...managerNav].flatMap((item) => [
      item,
      ...("children" in item && item.children ? item.children : []),
    ]);

    expect(entries.some((item) => item.id === "analytics")).toBe(false);
    expect(entries.some((item) => item.label === "Management Analytics")).toBe(false);
  });
});

describe("system information current access", () => {
  it("renders responsive access details and a separately sized settings action", () => {
    const markup = renderToStaticMarkup(React.createElement(CurrentAccessCard, { role: "manager", branchName: "Gulod / Main Branch", onOpenSettings: () => undefined }));
    expect(markup).toContain("Manager · Gulod / Main Branch");
    expect(markup).toContain("min-w-0");
    expect(markup).toContain("break-words");
    expect(markup).toContain("sm:w-auto");
    expect(markup).toContain("Open Profile &amp; Settings");
  });
  it("keeps the popup inside safe viewport insets on desktop, tablet, and mobile", () => {
    expect(SYSTEM_INFO_OVERLAY_CLASS).toContain("fixed inset-0");
    expect(SYSTEM_INFO_OVERLAY_CLASS).toContain("p-4");
    expect(SYSTEM_INFO_OVERLAY_CLASS).toContain("sm:p-5");
    expect(SYSTEM_INFO_OVERLAY_CLASS).toContain("sm:justify-end");
    expect(SYSTEM_INFO_PANEL_CLASS).toContain("max-w-lg");
    expect(SYSTEM_INFO_PANEL_CLASS).toContain("max-h-[calc(100dvh-2rem)]");
    expect(SYSTEM_INFO_PANEL_CLASS).toContain("sm:mt-[3.75rem]");
    expect(SYSTEM_INFO_PANEL_CLASS).toContain("sm:max-h-[calc(100dvh-6.25rem)]");
    expect(SYSTEM_INFO_PANEL_CLASS).toContain("overflow-y-auto");
  });
});
