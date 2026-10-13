import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PosSource } from "../../types/inventoryWorkflow";
import { activePosSourcesForBranch, canValidatePosImport, PosSourceField, resolvedPosSourceId } from "./PosImportModal";

const source = (id: string, branchId: string, displayName: string, status: PosSource["status"] = "ACTIVE"): PosSource => ({
  id,
  branchId,
  branchName: branchId === "gulod" ? "Gulod / Main Branch" : "Lipa",
  sourceCode: id.toUpperCase(),
  displayName,
  supportedFormat: "TRANSACTION_SUMMARY_XLSX",
  fieldMapping: null,
  status,
  formatVerifiedBy: null,
  formatVerifiedAt: null,
});

describe("Import POS Sales source selection", () => {
  it("renders one branch source as read-only text without a dropdown", () => {
    const sources = activePosSourcesForBranch([source("gulod-source", "gulod", "Libro POS Transaction Summary XLSX")], "gulod");
    const markup = renderToStaticMarkup(<PosSourceField sources={sources} sourceId={resolvedPosSourceId(sources, "")} loading={false} onChange={vi.fn()} />);

    expect(markup).toContain("<span>POS Source: </span>");
    expect(markup).toContain("<strong style=\"color:var(--app-primary)\">Libro POS Transaction Summary XLSX</strong>");
    expect(markup).not.toContain("<select");
    expect(resolvedPosSourceId(sources, "")).toBe("gulod-source");
    expect(canValidatePosImport(true, false, "gulod-source", sources)).toBe(true);
  });

  it("renders a dropdown for multiple active sources and requires a selection", () => {
    const sources = [source("source-a", "gulod", "Source A"), source("source-b", "gulod", "Source B")];
    const markup = renderToStaticMarkup(<PosSourceField sources={sources} sourceId="" loading={false} onChange={vi.fn()} />);

    expect(markup).toContain("<select");
    expect(markup).toContain("Select active POS source");
    expect(markup).toContain("Source A");
    expect(markup).toContain("Source B");
    expect(resolvedPosSourceId(sources, "")).toBe("");
  });

  it("shows a branch-specific warning and no selector when there are no active sources", () => {
    const markup = renderToStaticMarkup(<PosSourceField sources={[]} sourceId="" loading={false} onChange={vi.fn()} />);

    expect(markup).toContain("No active POS source is configured for this branch.");
    expect(markup).not.toContain("<select");
    expect(resolvedPosSourceId([], "old-source")).toBe("");
    expect(canValidatePosImport(true, false, "", [])).toBe(false);
  });

  it("resolves source selection correctly when the branch changes", () => {
    const allSources = [source("gulod-source", "gulod", "Gulod POS"), source("lipa-a", "lipa", "Lipa POS A"), source("lipa-b", "lipa", "Lipa POS B")];
    const gulodSources = activePosSourcesForBranch(allSources, "gulod");
    const lipaSources = activePosSourcesForBranch(allSources, "lipa");

    expect(resolvedPosSourceId(gulodSources, "")).toBe("gulod-source");
    expect(resolvedPosSourceId(lipaSources, "gulod-source")).toBe("");
  });

  it("excludes inactive and other-branch sources", () => {
    const sources = activePosSourcesForBranch([
      source("gulod-active", "gulod", "Gulod Active"),
      source("gulod-inactive", "gulod", "Gulod Inactive", "INACTIVE"),
      source("lipa-active", "lipa", "Lipa Active"),
    ], "gulod");

    expect(sources.map(({ id }) => id)).toEqual(["gulod-active"]);
    const markup = renderToStaticMarkup(<PosSourceField sources={sources} sourceId="gulod-active" loading={false} onChange={vi.fn()} />);
    expect(markup).not.toContain("Lipa Active");
    expect(markup).not.toContain("Gulod Inactive");
  });
});
