import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PosSource } from "../../types/inventoryWorkflow";
import { activePosSourcesForBranch, canValidatePosImport, hasInvalidCsvEncoding, isSupportedPosFilename, managerPosSourceLabel, MANAGER_POS_FORMAT_REQUEST_MESSAGE, POS_FORMAT_REQUEST_SENT_MESSAGE, PosImportModal, PosSourceField, resolvedPosSourceId } from "./PosImportModal";
import { posSourceReadiness, PosMappingRecoveryNotice } from "./posImportPresentation";

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
  formatVerifiedAt: status === "ACTIVE" ? "2026-10-01T00:00:00Z" : null,
  hasActiveMappings: status === "ACTIVE",
  hasPendingMappings: false,
});

describe("Import POS Sales source selection", () => {
  it("renders the one shared Select File, Validate, Import workflow", () => {
    const markup = renderToStaticMarkup(<PosImportModal
      open
      branchId="gulod"
      branchName="Gulod / Main Branch"
      onClose={vi.fn()}
      onImported={vi.fn()}
    />);

    expect(markup).toContain("Import POS Sales");
    expect(markup).toContain("Gulod / Main Branch");
    expect(markup).toContain("Select File");
    expect(markup).toContain("Validate");
    expect(markup).toContain("Import");
    expect(markup).not.toContain("Upload POS Sales File");
  });

  it("uses the shared Manager format-request wording and retained-workbook recovery action", () => {
    const markup = renderToStaticMarkup(<PosMappingRecoveryNotice
      onConfigure={vi.fn()}
      message={MANAGER_POS_FORMAT_REQUEST_MESSAGE}
      actionLabel="Request POS Format Setup"
    />);

    expect(markup).toContain("New POS file format detected");
    expect(markup).toContain("Request POS Format Setup");
    expect(POS_FORMAT_REQUEST_SENT_MESSAGE).toBe("Format setup request sent to the Owner. The sales file will continue processing after the format is configured.");
  });

  it("owns the supported-file and CSV encoding validation for both entry points", () => {
    expect(["sales.csv", "summary.XLS", "transactions.xlsx"].every(isSupportedPosFilename)).toBe(true);
    expect(isSupportedPosFilename("sales.pdf")).toBe(false);
    expect(hasInvalidCsvEncoding("product,quantity\nAmericano,2")).toBe(false);
    expect(hasInvalidCsvEncoding("product,quantity\nAmericano,\uFFFD")).toBe(true);
  });

  it("renders one branch source as read-only text without a dropdown", () => {
    const sources = activePosSourcesForBranch([source("gulod-source", "gulod", "Libro POS Transaction Summary XLSX")], "gulod");
    const markup = renderToStaticMarkup(<PosSourceField sources={sources} sourceId={resolvedPosSourceId(sources, "")} loading={false} onChange={vi.fn()} />);

    expect(markup).toContain("<span>POS Source: </span>");
    expect(markup).toContain("<strong style=\"color:var(--app-primary)\">Libro POS - Libro Espresso XLSX - Ready</strong>");
    expect(markup).not.toContain("<select");
    expect(resolvedPosSourceId(sources, "")).toBe("gulod-source");
    expect(canValidatePosImport(true, false, "gulod-source", sources)).toBe(true);
  });

  it("derives current Manager labels from every configured format without obsolete suffixes", () => {
    const configuredSource = source("lipa-source", "lipa", "Lipa POS Summary Items Sold");
    expect(managerPosSourceLabel({ ...configuredSource, supportedFormat: "SUMMARY_ITEMS_SOLD_LEGACY_XLS" })).toBe("Lipa POS - Libro Espresso XLS - Ready");
    expect(managerPosSourceLabel({ ...configuredSource, supportedFormat: "TRANSACTION_SUMMARY_XLSX" })).toBe("Lipa POS - Libro Espresso XLSX - Ready");
    expect(managerPosSourceLabel({ ...configuredSource, supportedFormat: "CANONICAL_CSV" })).toBe("Lipa POS - Libro Espresso CSV - Ready");
    expect(managerPosSourceLabel({ ...configuredSource, supportedFormat: "CUSTOM_TABULAR_XLSX", fieldMapping: {productName:"Item",quantitySold:"Qty",transactionId:"OR",businessDate:"Date",status:"Status",unitPrice:"Price"} })).toBe("Lipa POS - Custom Mapped Spreadsheet - Ready");
  });

  it("distinguishes inactive, setup-required, pending-approval, and ready sources",()=>{
    const base=source("source","gulod","Gulod POS");
    expect(posSourceReadiness({...base,status:"INACTIVE"})).toBe("Inactive");
    expect(posSourceReadiness({...base,formatVerifiedAt:null,hasActiveMappings:false})).toBe("Setup Required");
    expect(posSourceReadiness({...base,hasActiveMappings:false,hasPendingMappings:true})).toBe("Pending Approval");
    expect(posSourceReadiness(base)).toBe("Ready");
  });

  it("uses the shared reduced-motion skeleton while branch POS sources load", () => {
    const markup = renderToStaticMarkup(<PosSourceField sources={[]} sourceId="" loading onChange={vi.fn()} />);

    expect(markup).toContain('aria-label="Loading POS sources"');
    expect(markup).toContain("motion-reduce:animate-none");
    expect(markup).not.toContain("No active POS source");
  });

  it("renders a dropdown for multiple active sources and requires a selection", () => {
    const sources = [source("source-a", "gulod", "Source A"), source("source-b", "gulod", "Source B")];
    const markup = renderToStaticMarkup(<PosSourceField sources={sources} sourceId="" loading={false} onChange={vi.fn()} />);

    expect(markup).toContain("<select");
    expect(markup).toContain("Select active POS source");
    expect(markup).toContain("Source A");
    expect(markup).toContain("Source B");
    expect(markup).toContain('value="source-a"');
    expect(markup).toContain('value="source-b"');
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
