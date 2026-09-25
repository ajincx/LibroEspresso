# COGS and Recipe Consumption Readiness Report

Validation date: September 25, 2026  
Validation mode: Read-only  
Database: `libro_cogs`

## Executive Summary

The variant-level recipe, ingredient-consumption, and COGS calculation path is internally ready for all 36 recipe-backed variants. Each effective recipe resolves from the sold variant, produces valid ingredient usage quantities, preserves the applicable ingredient cost in a sale-time snapshot, and supplies those snapshots to the existing COGS and inventory-consumption calculations.

The 45 variants without recipes are intentionally not consumption-ready. The POS preview rejects a matched variant without a valid active recipe, and the snapshot query cannot manufacture ingredient rows when no effective recipe exists.

No database record or application code was changed. This report is the only file created.

## Verified Database Baseline

| Record | Verified count |
| --- | ---: |
| Products | 69 |
| Variants | 81 |
| Ingredients | 36 |
| Recipes | 36 |
| Recipe items | 141 |
| Variants with an effective recipe | 36 |
| Variants without a recipe | 45 |
| POS sources | 0 |
| POS mappings | 0 |

## End-to-End Calculation Path

The verified application flow is:

`Sold menu item variant → recipe effective on the sale business date → recipe items → inventory ingredients → converted quantity consumed → sale-time unit-cost snapshot → product COGS and inventory consumption`

The recipe lookup uses `menu_item_variant_id`, not the parent product name. It also uses the sale's business date, so a future recipe version cannot be selected early and an expired version cannot be selected after its effective period.

For each recipe item, the system calculates:

`Quantity consumed = Quantity sold × (Recipe quantity converted to inventory unit ÷ Recipe yield)`

The snapshot stores the selected recipe version, inventory item, quantity consumed, inventory unit, and applicable unit cost. Official recipe-based COGS is then calculated from:

`COGS = SUM(Quantity consumed × Unit-cost snapshot)`

Inventory expected consumption uses the same saved quantity-consumed snapshots. It does not recalculate historical sales using a later recipe or ingredient cost.

## Validation Results

| Validation | Result | Evidence |
| --- | --- | --- |
| Variant recipe lookup | PASS | There are 36 currently effective recipes for 36 distinct variant IDs. Every recipe's variant belongs to the recipe's parent product. Invalid or ambiguous lookups: 0. |
| Recipe cost | PASS | All 36 recipe costs were recalculated from the 141 stored recipe quantities, supported unit conversion, recipe yield, and stored ingredient unit costs. Valid calculated costs: 36. |
| Margin calculation | PASS | For every recipe-backed variant, margin equals the variant selling price minus its calculated recipe cost. No separate or conflicting margin formula was found. |
| Ingredient consumption readiness | PASS | The 141 recipe items produce 141 valid prospective snapshot rows across 36 variants and 36 recipe versions. Invalid consumption quantities: 0. Invalid ingredient costs: 0. |
| Small/Large consumption | PASS | Twelve products have both Small and Large recipes. Across 54 shared ingredient rows, all 54 quantities differ between sizes. Equal quantity rows: 0. |
| Missing recipe handling | PASS | Forty-five variants have no recipe and produce zero fabricated usage rows. POS preview marks a matched variant invalid unless it has an effective recipe with compatible ingredient units. |
| RM-004 protection | PASS | Active recipe references to historical `RM-004` Ice: 0. |

## Referential and Unit Checks

| Check | Failures |
| --- | ---: |
| Recipe references an invalid or mismatched variant | 0 |
| Recipe item references a missing ingredient | 0 |
| Unsupported or incompatible recipe/inventory unit | 0 |
| Active recipe contains no recipe items | 0 |
| Duplicate recipe effective for the same variant and date | 0 |
| Recipe item references RM-004 Ice | 0 |

All current recipe items use compatible unit pairs. The active data uses `g → g`, `ml → ml`, and `pc → pc`, although the existing conversion service also supports compatible `g/kg` and `ml/L` conversions.

## Recipe Cost and Margin Verification

All 36 calculated recipe costs were valid and non-negative. Current costs range from ₱10.50 to ₱74.80.

Representative verified results are shown below:

| Product | Variant | Selling price | Recipe cost | Margin | Margin % |
| --- | --- | ---: | ---: | ---: | ---: |
| Americano | Standard | ₱129.00 | ₱17.16 | ₱111.84 | 86.70% |
| Americano | Small | ₱119.00 | ₱18.06 | ₱100.94 | 84.82% |
| Americano | Large | ₱139.00 | ₱22.84 | ₱116.16 | 83.57% |
| Barako Brew | Standard | ₱99.00 | ₱14.10 | ₱84.90 | 85.76% |
| Chocolate Java Chip | Small | ₱139.00 | ₱53.95 | ₱85.05 | 61.19% |
| Chocolate Java Chip | Large | ₱189.00 | ₱74.80 | ₱114.20 | 60.42% |
| Pure Chamomile | Standard | ₱109.00 | ₱10.50 | ₱98.50 | 90.37% |

For example, Barako Brew uses 18g of Barako Coffee Beans at ₱0.65/g and 240ml of Filtered Water at ₱0.01/ml:

`Recipe cost = (18 × ₱0.65) + (240 × ₱0.01) = ₱14.10`

`Margin = ₱99.00 − ₱14.10 = ₱84.90`

## Small/Large Consumption Validation

The following products have valid paired Small and Large recipes with shared ingredient identities and different consumption quantities:

| Product | Shared ingredient rows | Different quantity rows | Result |
| --- | ---: | ---: | --- |
| Americano | 3 | 3 | PASS |
| Café Latte | 4 | 4 | PASS |
| Caramel Macchiato | 5 | 5 | PASS |
| Chocolate | 4 | 4 | PASS |
| Chocolate Java Chip | 5 | 5 | PASS |
| Crushed Oreo | 4 | 4 | PASS |
| Matcha Latte | 4 | 4 | PASS |
| Salted Caramel | 5 | 5 | PASS |
| Salted Caramel Latte | 6 | 6 | PASS |
| Spanish Latte | 5 | 5 | PASS |
| Strawberry Cream | 4 | 4 | PASS |
| White Mocha Latte | 5 | 5 | PASS |
| **Total** | **54** | **54** | **PASS** |

This confirms that a sale of a Small variant and a sale of the corresponding Large variant will generate different ingredient-consumption quantities while continuing to reference the shared ingredient master records.

## Missing Recipe Protection

The database currently contains 45 variants without recipes. Their behavior is safe:

1. POS preview requires an effective variant recipe and at least one compatible recipe item before a row can be imported.
2. A recipe-less matched variant is marked invalid with a missing/invalid recipe issue.
3. The sale-time snapshot query uses an inner effective-recipe lookup. Without a matching recipe, it returns no recipe items.
4. Recipe cost and margin remain unavailable rather than being treated as zero.

The read-only simulation produced zero fabricated ingredient-usage rows for all 45 missing-recipe variants.

## RM-004 Protection

No active or historical recipe item references SKU `RM-004` Ice. Cold beverage recipes use the separately defined weight-based ice ingredient where their approved demonstration recipe requires ice. Therefore, no consumption snapshot can currently be generated from the undefined `pc` measurement of RM-004.

## Relevant Test Results

Only focused tests related to this review were run.

| Test area | Result |
| --- | ---: |
| Backend recipe lookup, versioning, and sale-time snapshots | Passed |
| Backend unit conversion | Passed |
| Backend financial and COGS calculations | Passed |
| Backend POS preview/import recipe safeguards | Passed |
| Backend controlled recipe-batch calculations | Passed |
| Backend focused total | 80 passed |
| Frontend margin and unavailable-recipe behavior | 4 passed |
| **Combined focused total** | **84 passed** |

## Readiness Limits and Recommended Next Action

The recipe-to-consumption-to-COGS path is ready for the 36 recipe-backed variants. It is not yet ready for the remaining 45 variants, which should stay blocked until controlled recipes are approved.

Additionally, the database currently has zero POS sources and zero POS product/variant mappings. This does not invalidate the calculation path, but supplier Excel rows cannot yet resolve through the approved POS mapping layer. The next safe action is to configure reviewed POS sources and explicit product/variant mappings for recipe-backed variants only. Recipe-less variants must remain non-importable until their recipe composition is approved.

