import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  getAuthorizedHelpSections,
  HelpBackButton,
  HelpGuide,
  searchAuthorizedHelp,
} from "./HelpGuide";
import { settingsMenuForRole } from "./SettingsPage";

const sectionIds = (role: "OWNER" | "BRANCH_MANAGER" | "STAFF") =>
  getAuthorizedHelpSections(role).map((section) => section.id);

const topicIds = (role: "OWNER" | "BRANCH_MANAGER" | "STAFF") =>
  getAuthorizedHelpSections(role).flatMap((section) => section.topics.map((topic) => topic.id));

describe("Help & User Guide access", () => {
  it("places Help after Business Information for the Owner", () => {
    expect(settingsMenuForRole("OWNER").map(({ id }) => id).slice(-2)).toEqual(["business", "help"]);
  });

  it("provides Owner guidance without manager-only physical-count actions", () => {
    expect(sectionIds("OWNER")).toEqual([
      "quick-start", "dashboard", "cogs-sales", "menu-recipes", "inventory",
      "purchase-orders", "variance", "classification-review", "predictive",
      "reports", "staff-monitoring", "settings",
    ]);
    expect(topicIds("OWNER")).toContain("configure-reorder-policy");
    expect(topicIds("OWNER")).toContain("owner-classification-review");
    expect(topicIds("OWNER")).not.toContain("record-physical-count");
    expect(topicIds("OWNER")).not.toContain("create-purchase-order");
  });

  it("provides Branch Manager operational guidance without Owner-only topics", () => {
    expect(topicIds("BRANCH_MANAGER")).toContain("record-physical-count");
    expect(topicIds("BRANCH_MANAGER")).toContain("create-purchase-order");
    expect(topicIds("BRANCH_MANAGER")).toContain("manager-investigation");
    expect(topicIds("BRANCH_MANAGER")).not.toContain("configure-reorder-policy");
    expect(topicIds("BRANCH_MANAGER")).not.toContain("owner-business-settings");
    expect(topicIds("BRANCH_MANAGER")).not.toContain("owner-classification-review");
  });

  it("limits Staff to Quick Start, Dashboard, incident reporting, and Settings", () => {
    expect(sectionIds("STAFF")).toEqual(["quick-start", "dashboard", "staff-monitoring", "settings"]);
    expect(topicIds("STAFF")).toEqual([
      "staff-quick-start", "staff-portal", "submit-incident", "personal-settings", "help-guide",
    ]);
  });

  it("filters by role before searching", () => {
    expect(searchAuthorizedHelp("OWNER", "reorder policy").flatMap(({ topics }) => topics.map(({ id }) => id)))
      .toContain("configure-reorder-policy");
    expect(searchAuthorizedHelp("BRANCH_MANAGER", "reorder policy")).toEqual([]);
    expect(searchAuthorizedHelp("STAFF", "purchase order")).toEqual([]);
  });
});

describe("Help & User Guide UI", () => {
  it("renders searchable, expandable, responsive theme-aware categories", () => {
    const markup = renderToStaticMarkup(React.createElement(HelpGuide, { role: "BRANCH_MANAGER" }));
    expect(markup).toContain("Search help topics");
    expect(markup).toContain("<details");
    expect(markup).toContain("Inventory Management");
    expect(markup).toContain("var(--app-surface)");
    expect(markup).toContain("sm:grid-cols-2");
  });

  it("provides a working Back to Help action for topic navigation", () => {
    const onBack = vi.fn();
    const element = HelpBackButton({ onBack });
    element.props.onClick();
    expect(onBack).toHaveBeenCalledOnce();
    expect(renderToStaticMarkup(element)).toContain("Back to Help");
  });

  it("keeps implementation terminology out of user-facing guidance", () => {
    const copy = getAuthorizedHelpSections("OWNER")
      .flatMap((section) => [section.title, section.description, ...section.topics.flatMap((topic) => [topic.title, topic.summary, ...topic.steps, ...(topic.tips ?? [])])])
      .join(" ");
    expect(copy).not.toMatch(/\b(API|SQL|database|controller|service|migration|endpoint|UUID)\b/i);
  });
});
