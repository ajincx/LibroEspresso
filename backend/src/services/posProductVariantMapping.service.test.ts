import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { loadPosSource, normalizePosIdentity, posResolutionFingerprint, resolvePosMapping, type PosMappingRecord } from "./posProductVariantMapping.service.js";
import type { ParsedPosRow } from "./posCsvImport.service.js";

const branchA = "00000000-0000-4000-8000-000000000001";
const branchB = "00000000-0000-4000-8000-000000000002";
const row = (name: string, code: string | null = null): ParsedPosRow => ({
  rowNumber: 1, sourceProduct: name, sourceProductName: name, sourceProductId: code,
  quantitySold: 1, unitPrice: 149, businessDate: "2026-09-16", transactionId: "R1",
  sourceLineId: "1", transactionTimestamp: null, status: "VALID", issues: [],
});
const mapping = (overrides: Partial<PosMappingRecord> = {}): PosMappingRecord => ({
  id: "mapping-global", status: "ACTIVE", branchId: null, sourceProductName: "C12 SPNLT",
  sourceProductCode: null, menuItemVariantId: "variant-small", menuItemId: "cold-spanish",
  menuItemName: "Spanish Latte", variantName: "Small", variantStatus: "ACTIVE",
  productStatus: "ACTIVE", approvalStatus: "APPROVED", branchAvailable: true,
  recipeValid: true, updatedAt: "2026-09-16T00:00:00Z", ...overrides,
});

describe("reviewed POS product/variant resolution", () => {
  it("matches an approved global mapping using exact normalized name", () => {
    expect(resolvePosMapping(row("  c12   spnlt "), branchA, [mapping()])).toMatchObject({ status: "APPROVED", scope: "GLOBAL", menuItemId: "cold-spanish", menuItemVariantId: "variant-small" });
    expect(normalizePosIdentity(" C12  SPNLT ")).toBe("c12 spnlt");
  });
  it("uses a branch mapping only in that branch and overrides the global mapping", () => {
    const local = mapping({ id: "mapping-local", branchId: branchA, menuItemVariantId: "variant-large", variantName: "Large" });
    expect(resolvePosMapping(row("C12 SPNLT"), branchA, [mapping(), local])).toMatchObject({ scope: "BRANCH", menuItemVariantId: "variant-large" });
    expect(resolvePosMapping(row("C12 SPNLT"), branchB, [mapping(), local])).toMatchObject({ scope: "GLOBAL", menuItemVariantId: "variant-small" });
  });
  it("ignores inactive mappings and inactive variants", () => {
    expect(resolvePosMapping(row("C12 SPNLT"), branchA, [mapping({ status: "INACTIVE" })]).status).toBe("UNMATCHED");
    expect(resolvePosMapping(row("C12 SPNLT"), branchA, [mapping({ variantStatus: "INACTIVE" })]).status).toBe("UNMATCHED");
  });
  it("requires both exact code and exact name when a separate code exists", () => {
    const coded = mapping({ sourceProductCode: "POS-123" });
    expect(resolvePosMapping(row("C12 SPNLT", "pos-123"), branchA, [coded]).status).toBe("APPROVED");
    expect(resolvePosMapping(row("Warm Spanish Latte", "POS-123"), branchA, [coded])).toMatchObject({ status: "UNMATCHED", issue: expect.stringContaining("disagree") });
    expect(resolvePosMapping(row("C12 SPNLT", "POS-999"), branchA, [coded]).status).toBe("UNMATCHED");
  });
  it("never guesses an unmatched name or a duplicate approved target", () => {
    expect(resolvePosMapping(row("UNKNOWN ITEM"), branchA, [mapping()]).status).toBe("UNMATCHED");
    expect(resolvePosMapping(row("C12 SPNLT"), branchA, [mapping(), mapping({ id: "duplicate", menuItemVariantId: "other" })]).status).toBe("AMBIGUOUS");
  });
  it("rejects a product unavailable in the branch", () => {
    expect(resolvePosMapping(row("C12 SPNLT"), branchA, [mapping({ branchAvailable: false })]).status).toBe("UNMATCHED");
  });
  it("includes source, parent, variant, mapping identity and version in the resolution fingerprint", () => {
    const first = { menuItemId: "parent", menuItemVariantId: "small", mappingId: "m1", mappingVersion: "v1" };
    const fingerprint = posResolutionFingerprint("source-1", [first]);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    for (const [source, changed] of [["source-2", first], ["source-1", { ...first, menuItemVariantId: "large" }], ["source-1", { ...first, mappingVersion: "v2" }]] as const) {
      expect(posResolutionFingerprint(source, [changed])).not.toBe(fingerprint);
    }
  });
  it("requires an active source whose configured format matches the file", async () => {
    const client = { query: vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: "source-1", sourceCode: "VERIFIED", displayName: "Verified", supportedFormat: "SUMMARY_ITEMS_SOLD_LEGACY_XLS" }] }) };
    await expect(loadPosSource(client as never, "source-1", "SUMMARY_ITEMS_SOLD_LEGACY_XLS")).rejects.toMatchObject({ code: "POS_SOURCE_UNAVAILABLE" });
    await expect(loadPosSource(client as never, "source-1", "TRANSACTION_SUMMARY_XLSX")).rejects.toMatchObject({ code: "POS_SOURCE_FORMAT_MISMATCH" });
  });
  it("adds nullable provenance without rewriting historical sale or recipe rows", async () => {
    const migration = await readFile(new URL("../../migrations/032_pos_product_variant_mapping.sql", import.meta.url), "utf8");
    expect(migration).toMatch(/ALTER TABLE pos_sale_items ADD COLUMN menu_item_variant_id uuid/);
    expect(migration).toMatch(/ALTER TABLE pos_imports ADD COLUMN pos_source_id uuid/);
    expect(migration).not.toMatch(/\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+(?:pos_sale_items|recipes|menu_items)\b/i);
  });
});
