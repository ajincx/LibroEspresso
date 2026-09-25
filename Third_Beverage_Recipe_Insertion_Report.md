# Third Beverage Recipe Batch Insertion Report

## Scope and provenance

This report records the controlled creation of the approved Chocolate, Matcha Latte, and White Mocha Latte recipes. Every recipe quantity and ingredient cost is **SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION** and is not verified Libro Espresso operational data.

## Created recipes and calculated results

| Category | Product | Variant | Recipe ID | Version | Price | Recipe cost | Margin | Margin % |
|---|---|---|---|---:|---:|---:|---:|---:|
| Warm Tales | Chocolate | Standard | `a89032d1-3626-4e96-b0e1-ba57155cbcf4` | 1 | ₱179.00 | ₱41.20 | ₱137.80 | 76.98% |
| Cold Classics | Chocolate | Small | `bef0bc52-7dcc-427d-8dad-b60428c4240d` | 1 | ₱159.00 | ₱39.90 | ₱119.10 | 74.91% |
| Cold Classics | Chocolate | Large | `2edcad40-d760-4c51-ae0a-5fa92b085a44` | 1 | ₱179.00 | ₱54.35 | ₱124.65 | 69.64% |
| Warm Tales | Matcha Latte | Standard | `5e0c8dd8-4e88-4f6d-9cf1-2fe39b9cd4fa` | 1 | ₱179.00 | ₱41.20 | ₱137.80 | 76.98% |
| Cold Classics | Matcha Latte | Small | `3a191bdb-9db1-401a-8ee1-fb7a840b7377` | 1 | ₱159.00 | ₱39.90 | ₱119.10 | 74.91% |
| Cold Classics | Matcha Latte | Large | `c96a3e93-abc2-4859-a29a-0c2d5885e441` | 1 | ₱189.00 | ₱54.35 | ₱134.65 | 71.24% |
| Cold Classics | White Mocha Latte | Small | `cf388a98-6c87-49ab-9542-564de4ac2f38` | 1 | ₱159.00 | ₱48.51 | ₱110.49 | 69.49% |
| Cold Classics | White Mocha Latte | Large | `c2b4a361-5723-4619-abf9-5f31005d27cf` | 1 | ₱199.00 | ₱63.24 | ₱135.76 | 68.22% |

Costs and margins were produced through the existing recipe unit-conversion and costing implementation. No alternative formula was introduced.

## Database counts

| Record type | Before | After |
|---|---:|---:|
| Products | 69 | 69 |
| Product variants | 81 | 81 |
| Inventory items | 36 | 36 |
| Recipes | 13 | 21 |
| Recipe items | 50 | 82 |
| POS sources | 0 | 0 |
| POS product/variant mappings | 0 | 0 |

Eight variant-specific recipe records and 32 recipe-item records were added. Chocolate and Matcha Latte received Standard, Small, and Large recipes because those variants exist. White Mocha Latte received only Small and Large recipes because it has no Standard variant.

## Safety verification

All 13 pre-existing recipes and their 50 recipe items were compared with full pre-transaction snapshots and remained unchanged. Full snapshots also confirmed no changes to products, variants, inventory items, branch settings, balances, inventory movements, inventory counts, inventory count items, POS sources, POS mappings, POS imports, POS sale items, or historical POS ingredient-usage records.

Small and Large recipes share the same ingredient identities but store intentionally different quantities. Cold recipes use `Ice — By Weight` (`ING-00018`); Standard recipes do not use ice. None of the new recipes uses RM-004 `Ice`.

Every recipe is version 1 and stores `SAMPLE / ASSUMED RECIPE QUANTITY — FOR SYSTEM DEMONSTRATION` as its change reason. A matching `CREATE_SAMPLE_RECIPE` audit entry records the source, product, variant, cost, price, margin, margin percentage, and sample provenance.
