# POS First Import Simulation Report

## Scope and Safety

The first-import simulation is read-only. It extends the existing POS preview response and interface with estimated ingredient consumption, official recipe-based COGS, gross profit, and gross margin. It does not confirm an import, create a POS source, create a product mapping, or write sales and ingredient-usage snapshots.

The existing confirmation endpoint and transaction were not changed. The simulation query runs only during preview; confirmation continues to rebuild and validate its own fingerprint before using the established atomic import workflow.

## 1. Sample POS File Preview Flow

The controlled test used the existing legacy Summary Items Sold XLS parser with an in-memory sample containing one transaction and one line:

| Field | Simulated value |
| --- | --- |
| Source product | Iced Latte, Large |
| Quantity | 2 |
| Unit price | ₱190.00 |
| Line amount | ₱380.00 |
| Business date | 2026-09-08 |
| Transaction | R-1 |

The preview detected `SUMMARY_ITEMS_SOLD_LEGACY_XLS`, calculated the content fingerprint, validated the single business date, and returned the existing validation summary. Preview execution issued no INSERT, UPDATE, or DELETE operation.

Because the live database currently contains zero POS sources and zero POS mappings, a real client Excel file remains blocked until an Owner configures and approves them. The successful mapped scenario was therefore exercised with in-memory test doubles only; nothing was added to the database.

## 2. Mapping Resolution Output

The simulation verified the existing exact mapping resolver. The sample row resolved as Approved, Global scope, to its intended parent product and variant. The output includes the mapping status, mapping scope, target product, target variant, mapping identity, and resolution fingerprint.

The resolver continues to reject unmatched names, conflicting name/code combinations, inactive mappings, inactive targets, branch-unavailable products, and ambiguous duplicate candidates. It does not guess a product or variant.

## 3. Variant Recipe Lookup

The preview resolves the recipe directly from `menu_item_variant_id` using the business date. It requires an active recipe whose effective period includes that date, at least one recipe item, and compatible recipe/inventory units.

The preview now returns the resolved recipe version number beside each mapped row. A variant without a valid effective recipe remains Invalid and cannot produce a complete simulation or proceed to import.

## 4. Ingredient Consumption Preview

For every valid resolved row, the simulation follows:

`POS row → mapped variant → effective recipe version → recipe items → inventory ingredients`

Quantities use the existing unit-conversion rules and recipe yield. Branch-specific current unit cost is selected when available; otherwise the existing inventory-item unit cost remains the source. Results are aggregated by inventory item and inventory unit.

The controlled example used 18 g of Coffee Beans per item, stored in kg. For two sold items, the preview returned 0.036 kg expected consumption. No `pos_sale_ingredient_usage` record was created.

## 5. Estimated COGS Preview

Estimated COGS uses only recipe-derived ingredient quantities and the existing unit costs. The controlled example calculated:

| Measure | Result |
| --- | ---: |
| Estimated sales | ₱380.00 |
| Expected Coffee Beans consumption | 0.036 kg |
| Unit cost | ₱800.00/kg |
| Estimated official COGS | ₱28.80 |

Detected shortages and shrinkage are not added to the estimate. No second costing mechanism was introduced.

## 6. Estimated Gross Margin Preview

The simulation delegates financial totals to the existing financial-summary implementation:

`Gross Profit = Sales − Official Total COGS`

`Gross Margin = Gross Profit ÷ Sales × 100`

For the controlled example, estimated gross profit was ₱351.20 and estimated gross margin was approximately 92.42%. These are clearly presented as preview estimates and are not persisted as official sales results.

If any row is invalid, unmatched, ambiguous, or missing a valid recipe, the UI identifies the simulation as partial. A complete label is shown only when the existing preview summary permits import.

## 7. Branch Isolation Validation

Branch isolation remains enforced at every preview stage. The authenticated Branch Manager determines the effective branch. Product availability and mapping resolution use that branch, branch-specific mappings override global mappings only within their branch, and branch inventory settings are joined using the same authenticated branch ID.

The focused controller test verified that the simulation cost query receives the authenticated branch ID. Existing mapping tests verified that a branch-specific mapping is ignored outside its branch and that a global mapping remains the fallback for other authorized branches.

## Database Verification

The read-only verification after testing returned:

| Table | Count |
| --- | ---: |
| Products | 69 |
| Variants | 81 |
| Inventory items | 36 |
| Recipes | 36 |
| Recipe items | 141 |
| POS sources | 0 |
| POS mappings | 0 |
| POS imports | 0 |
| POS sale items | 0 |
| POS ingredient-usage snapshots | 0 |

## Tests

Focused backend tests: 52 passed across POS preview/import isolation, product/variant mapping, recipe lookup/versioning, financial formulas, and the new read-only simulation calculation.

Focused frontend tests: 15 passed across the POS preview service workflow and Cost and Sales presentation helpers.

No production build, migration, seed, or database write command was run for this task.

## Conclusion

The first-import preview is ready to show mapping resolution, variant recipe version, expected ingredient consumption, estimated official COGS, estimated gross profit, and estimated gross margin before confirmation. Live Excel mapping simulation will remain correctly blocked until the Owner registers a real POS source and approves real product/variant mappings.
