import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("database concurrency guards", () => {
  it("keeps duplicate POS imports protected by database identities", () => {
    const migration = source("../../migrations/025_pos_import_integrity.sql");
    expect(migration).toContain("pos_imports_content_identity_idx");
    expect(migration).toContain("pos_sale_items_source_identity_idx");
  });

  it("locks purchase orders and lines while receiving deliveries", () => {
    const controller = source("../controllers/operations.controller.ts");
    expect(controller).toMatch(/purchase_orders[\s\S]*status IN \('ORDERED','PARTIALLY_RECEIVED'\) FOR UPDATE/);
    expect(controller).toMatch(/purchase_order_items[\s\S]*purchase_order_id=\$2 FOR UPDATE/);
  });

  it("serializes inventory counts, recipe versions, and login counters", () => {
    expect(source("../controllers/inventoryWorkflow.controller.ts")).toMatch(/FROM inventory_counts[\s\S]*submitted_by=\$3 FOR UPDATE/);
    expect(source("./recipeVersion.service.ts")).toContain("FOR UPDATE");
    expect(source("../../migrations/027_recipe_unit_costing_integrity.sql")).toContain("recipes_one_open_version_uq");
    expect(source("./auth.service.ts")).toContain("FOR UPDATE OF u");
  });
});
