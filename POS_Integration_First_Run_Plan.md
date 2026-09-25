# POS Integration First-Run Plan

Preparation date: September 25, 2026  
Mode: Read-only configuration review  
Current status: No POS sources, mappings, imports, or sales have been created

## Purpose and Current Readiness

This plan describes the controlled configuration and validation sequence for the first Libro Espresso supplier POS integration. It does not authorize source creation, mapping creation, or sales import.

The current system provides:

| Record or capability | Current state |
| --- | ---: |
| Products | 69 |
| Variants | 81 |
| Ingredients | 36 |
| Recipes | 36 |
| Recipe items | 141 |
| Recipe-backed variants eligible for mapping review | 36 |
| Recipe-less variants that must remain non-importable | 45 |
| POS sources | 0 |
| POS mappings | 0 |
| POS imports | 0 |

The source, mapping, parser, recipe-validation, resolution-fingerprint, sale snapshot, inventory-consumption, and COGS paths are already implemented. The next activity is controlled data configuration, not importer redevelopment.

## 1. POS Configuration Workflow

The approved first-run workflow should follow this sequence:

### Phase A — Supplier export verification

1. Obtain a current, item-level export directly from the supplier POS used by one branch.
2. Record the supplier name, branch, file extension, detected workbook/report type, worksheet, export date, and POS version when available.
3. Confirm that the file contains a business date, item identity, quantity, and item-level selling price or line amount.
4. Confirm that products are represented as separate line items and not combined into one description or transaction-total cell.
5. Confirm how voids, refunds, discounts, sizes, and hot/cold distinctions appear.
6. Do not proceed if the file is aggregate-only or does not provide safe item-level quantity and price information.

### Phase B — Source registration

1. The Owner creates one inactive POS source for the verified supplier/export format.
2. The configured format must match the format detected by the existing parser.
3. The Owner reviews the source code, display name, and detected format.
4. The Owner activates the source only after this verification.
5. A separate source should be used when two supplier systems or materially different export structures require different parser formats.

### Phase C — Mapping proposal

1. Extract the exact POS item name and optional POS item code from the supplier export.
2. Propose a target Libro parent product and variant.
3. Confirm that the target is active, approved, available to the branch, and one of the 36 recipe-backed variants.
4. Decide whether the identity is global or branch-specific.
5. Keep ambiguous or recipe-less items unmapped.
6. Create proposed mappings as inactive only during a later authorized phase.

### Phase D — Owner review and activation

1. The Owner compares every exact source identity against the selected Libro product, category, and variant.
2. When a POS code exists, both code and product name must agree.
3. The Owner activates only mappings with one unambiguous target.
4. Source and mapping audit records must identify the Owner review.

### Phase E — Preview-only first run

1. The assigned Branch Manager selects the verified source.
2. The Branch Manager uploads a small, representative, single-business-day export.
3. The system detects the format, validates the selected source, resolves mappings, selects effective variant recipes, and displays the complete preview.
4. All rows must be reviewed. Do not confirm while any row is invalid, unmatched, ambiguous, recipe-less, or missing an item-level price.
5. Save the preview evidence and reconcile it with the supplier report.

### Phase F — Separately authorized first import

The first sales import should occur only after the preview and reconciliation are approved in a separate task. The content hash and resolution fingerprint must be returned unchanged during confirmation. Any file, source, mapping, variant, or recipe resolution change requires a new preview.

## 2. Required Fields for Registering a Supplier POS

### POS source record

| Field | Required | Rule |
| --- | --- | --- |
| Source code | Yes | Stable unique identifier, 2–80 characters; stored uppercase |
| Display name | Yes | Clear supplier/system name, 2–160 characters |
| Supported format | Yes | `CANONICAL_CSV`, `SUMMARY_ITEMS_SOLD_LEGACY_XLS`, or `TRANSACTION_SUMMARY_XLSX` |
| Status | Yes | Must initially be `INACTIVE`; activation is a separate Owner review action |

Recommended review metadata should be retained outside the source row in the implementation record: supplier name, branch using the source, sample filename, worksheet/report name, POS software version if known, date reviewed, reviewer, and evidence that the configured parser format matches the sample.

### Future product/variant mapping record

These fields will be required later, but no mapping should be created during this plan:

| Field | Required | Rule |
| --- | --- | --- |
| POS source | Yes | Must identify the verified supplier source |
| Exact POS product name | Yes | Copy exactly from the export; normalization only trims spacing and letter case |
| POS product code | Optional but preferred | Use when the supplier provides a stable item code |
| Libro variant | Yes | Must target one exact active variant, not only the parent product |
| Branch | Optional | Null for global mapping; set only when a branch-specific identity or target is required |
| Status | Yes | Must initially be inactive |
| Reviewer and review time | Required for activation | Automatically recorded when the Owner activates the mapping |

## 3. First Import Validation Checklist

### Before source registration

- [ ] The export came directly from the correct supplier POS.
- [ ] The supplier and branch are documented.
- [ ] The file extension and workbook signature agree.
- [ ] The detected parser format is known.
- [ ] The export contains line-item-level data.
- [ ] Business date is available and correct.
- [ ] Each row has a product identity and positive quantity.
- [ ] Item-level selling price or line amount is available.
- [ ] Transaction totals have not been distributed among products.
- [ ] Discounts, voids, and refunds are understood from the source format.
- [ ] No products are combined in a single item cell.

### Before mapping activation

- [ ] The exact POS name was copied rather than guessed.
- [ ] The POS code was captured when available.
- [ ] Source code and name agree with each other.
- [ ] The selected Libro category, parent product, and variant are correct.
- [ ] Hot/cold and Small/Large distinctions are explicit.
- [ ] The target variant has an effective recipe.
- [ ] Recipe units are compatible with inventory units.
- [ ] The product is active, approved, and available in the applicable branch.
- [ ] Global and branch-specific mappings do not conflict.
- [ ] Ambiguous identities remain inactive or unmapped.

### During preview

- [ ] The selected source name is displayed correctly.
- [ ] Detected format matches the configured source format.
- [ ] Branch and business date are correct.
- [ ] Source-row count agrees with the supplier export.
- [ ] Every source product resolves to the intended parent product and variant.
- [ ] Mapping status is approved and scope is expected.
- [ ] Quantity and selling price agree with the source row.
- [ ] Invalid rows equal zero.
- [ ] Unmatched rows equal zero.
- [ ] Ambiguous rows equal zero.
- [ ] Duplicate-file indicator is No.
- [ ] Import quality is complete and `canImport` is true.
- [ ] Content fingerprint and resolution fingerprint are present.

### Before any later confirmation

- [ ] Preview reconciliation was signed off by the Owner and assigned Branch Manager.
- [ ] The file has not changed after preview.
- [ ] No source, mapping, product, variant, or recipe changed after preview.
- [ ] A database backup or recoverable pre-import state is available.
- [ ] The first import is limited to one branch and one business day.
- [ ] A post-import sales-to-COGS reconciliation owner is assigned.

## 4. Recommended Mapping Order for the 36 Recipe-Backed Variants

The order below reduces risk. It does not authorize mapping creation.

### Priority 1 — Unique Standard variants

These six targets have unique parent names and one Standard recipe. They are the safest initial mapping candidates when the exact POS identity is available.

| Order | Category | Product | Variant |
| ---: | --- | --- | --- |
| 1 | Warm Tales | Barako Brew | Standard |
| 2 | Warm Tales | Cappuccino | Standard |
| 3 | Warm Tales | Pure Chamomile | Standard |
| 4 | Warm Tales | Pure Jasmine | Standard |
| 5 | Warm Tales | Pure Lavender | Standard |
| 6 | Cold Classics | Green Apple Soda | Standard |

### Priority 2 — Unique product names with explicit size variants

Map these only when the POS identity explicitly distinguishes Small and Large through a code, name, or separate size field represented in the exported identity.

| Order | Category | Product | Variant |
| ---: | --- | --- | --- |
| 7 | Chilled Chapter | Chocolate Java Chip | Small |
| 8 | Chilled Chapter | Chocolate Java Chip | Large |
| 9 | Chilled Chapter | Crushed Oreo | Small |
| 10 | Chilled Chapter | Crushed Oreo | Large |
| 11 | Chilled Chapter | Salted Caramel | Small |
| 12 | Chilled Chapter | Salted Caramel | Large |
| 13 | Chilled Chapter | Strawberry Cream | Small |
| 14 | Chilled Chapter | Strawberry Cream | Large |
| 15 | Cold Classics | Salted Caramel Latte | Small |
| 16 | Cold Classics | Salted Caramel Latte | Large |
| 17 | Cold Classics | White Mocha Latte | Small |
| 18 | Cold Classics | White Mocha Latte | Large |

### Priority 3 — Duplicated hot/cold product families

These 18 variants have parent names that occur in both Warm Tales and Cold Classics. Map them only when the supplier POS identity establishes temperature/category and size without relying on the shared name alone.

| Order | Category | Product | Variant |
| ---: | --- | --- | --- |
| 19 | Warm Tales | Americano | Standard |
| 20 | Cold Classics | Americano | Small |
| 21 | Cold Classics | Americano | Large |
| 22 | Warm Tales | Café Latte | Standard |
| 23 | Cold Classics | Café Latte | Small |
| 24 | Cold Classics | Café Latte | Large |
| 25 | Warm Tales | Caramel Macchiato | Standard |
| 26 | Cold Classics | Caramel Macchiato | Small |
| 27 | Cold Classics | Caramel Macchiato | Large |
| 28 | Warm Tales | Chocolate | Standard |
| 29 | Cold Classics | Chocolate | Small |
| 30 | Cold Classics | Chocolate | Large |
| 31 | Warm Tales | Matcha Latte | Standard |
| 32 | Cold Classics | Matcha Latte | Small |
| 33 | Cold Classics | Matcha Latte | Large |
| 34 | Warm Tales | Spanish Latte | Standard |
| 35 | Cold Classics | Spanish Latte | Small |
| 36 | Cold Classics | Spanish Latte | Large |

Do not map any of the other 45 variants until they have approved recipes.

## 5. Potential Ambiguous Product Names

No source identities are configured in the database, so the following are menu-derived risks to check against the actual supplier export. They are not claims about a specific supplier's current naming.

### Confirmed duplicate Libro parent names

| Shared name | Possible Libro targets | Required POS evidence |
| --- | --- | --- |
| Americano | Warm Tales Standard; Cold Classics Small; Cold Classics Large | Hot/cold distinction and cold size |
| Café Latte | Warm Tales Standard; Cold Classics Small; Cold Classics Large | Hot/cold distinction and cold size |
| Caramel Macchiato | Warm Tales Standard; Cold Classics Small; Cold Classics Large | Hot/cold distinction and cold size |
| Chocolate | Warm Tales Standard; Cold Classics Small; Cold Classics Large | Hot/cold distinction and cold size |
| Matcha Latte | Warm Tales Standard; Cold Classics Small; Cold Classics Large | Hot/cold distinction and cold size |
| Spanish Latte | Warm Tales Standard; Cold Classics Small; Cold Classics Large | Hot/cold distinction and cold size |

### Additional naming risks to review

| Potential source identity | Risk | Safe handling |
| --- | --- | --- |
| Product name without `Small` or `Large` | Two possible size variants | Require a stable size-bearing name or POS code |
| `Cafe Latte` versus `Café Latte` | Supplier may omit the accent | Map the exact exported spelling explicitly; do not assume an alias |
| `Salted Caramel` versus `Salted Caramel Latte` | Similar names but different Libro products/categories | Require exact full name or distinct POS codes |
| `Chocolate` versus `Chocolate Java Chip` | Shortened source labels may collide | Do not use substring matching |
| `Chamomile`, `Jasmine`, or `Lavender` | POS may omit the `Pure` prefix | Review the exact source identity before mapping |
| `Oreo` versus `Crushed Oreo` | Generic alias may not identify the official product | Keep unmatched until confirmed |
| Abbreviated source names | Abbreviation meaning may vary by supplier | Pair the exact abbreviation with a stable POS product code when possible |

The resolver uses exact normalized identities and never fuzzy-matches these cases. Unknown or duplicated identities remain unmatched or ambiguous.

## 6. Branch Mapping Considerations

Global mappings should be preferred only when the same supplier source identity refers to the same Libro variant in every branch using that source.

Use a branch-specific mapping when:

- the supplier item code or name differs by branch;
- the same source identity intentionally represents a different approved variant in one branch;
- the product is branch-scoped;
- branch availability differs; or
- the source configuration has been verified only for one branch.

Important safeguards:

1. A branch-specific mapping overrides a global mapping for that branch.
2. It does not apply to another branch.
3. The mapped product must be active, approved, and available in the importing branch.
4. Branch Managers cannot create or activate mappings.
5. A global mapping must not target a branch-only product.
6. The first-run pilot should use one branch only, even when the intended mapping will later be global.
7. After the pilot, compare exports from the other branches before extending global applicability.

## 7. Sales-to-COGS Verification Checklist

This checklist applies only after a separately authorized first import.

### Imported sales

- [ ] Imported row count equals the approved preview row count.
- [ ] Business date, branch, transaction identity, and line identity match the source.
- [ ] Imported quantity equals the source item quantity.
- [ ] Selling-price snapshot equals the source item-level price.
- [ ] No transaction total was treated as a product price.
- [ ] No duplicate import was accepted.
- [ ] Every sale item stores the resolved parent product and variant.

### Recipe and consumption snapshots

- [ ] Each sale item references the recipe version effective on its business date.
- [ ] The selected recipe belongs to the sold variant.
- [ ] Small sales use Small recipes and Large sales use Large recipes.
- [ ] Ingredient consumption equals `quantity sold × converted recipe quantity ÷ recipe yield`.
- [ ] Ingredient identity, inventory unit, quantity consumed, unit-cost snapshot, and recipe version are stored.
- [ ] No usage snapshot references RM-004 Ice.
- [ ] No recipe-less sale item exists.

### COGS and margin

- [ ] Product COGS equals the sum of `quantity consumed × sale-time unit-cost snapshot`.
- [ ] Total COGS equals only the sum of product/recipe COGS.
- [ ] Detected shortage and verified shrinkage are not added to Total COGS.
- [ ] Gross Profit equals Sales Revenue minus Total COGS.
- [ ] Gross Margin equals Gross Profit divided by Sales Revenue multiplied by 100.
- [ ] Shrinkage is not subtracted from Gross Profit a second time.
- [ ] Dashboard, Cost and Sales, and Reports show the same backend totals.

### Inventory and branch isolation

- [ ] Expected ingredient consumption is visible only in the importing branch.
- [ ] Other branches' balances and analytics remain unchanged.
- [ ] Ingredient usage contributes correctly to expected stock calculations.
- [ ] No inventory balance is directly overwritten by the sales import.
- [ ] Audit records identify the importing Branch Manager and source file.

## Relevant Test Results

Only tests related to POS configuration, parsers, preview/import safeguards, recipe snapshots, financial semantics, access control, and frontend POS transport were run.

| Test area | Result |
| --- | ---: |
| Backend POS mapping and fingerprint tests | 9 passed |
| Backend CSV parser tests | 21 passed |
| Backend Excel parser tests | 13 passed |
| Backend preview/import safeguard tests | 13 passed |
| Backend recipe lookup and snapshot tests | 15 passed |
| Backend financial/COGS tests | 13 passed |
| Backend access-control integration tests | 32 passed |
| **Backend focused total** | **116 passed** |
| Frontend POS request/transport tests | 6 passed |
| Frontend Cost and Sales POS workflow tests | 5 passed |
| Frontend financial semantics tests | 1 passed |
| **Frontend focused total** | **12 passed** |
| **Combined focused total** | **128 passed** |

## Final Recommendation

The integration is ready for a controlled source-registration proposal, but not for sales import. Begin with one supplier, one branch, one representative item-level export, and the six Priority 1 mappings. Keep all records inactive until reviewed. Then perform a preview-only validation. Do not proceed to confirmation until every row, recipe, price, quantity, fingerprint, and reconciliation check passes.

