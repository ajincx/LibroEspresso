# Second Beverage Recipe Batch Insertion Report

## Scope and provenance

This report records the controlled creation of eight `Cold Classics` variant recipes. Every quantity is **SAMPLE / ASSUMED RECIPE QUANTITY — FOR SYSTEM DEMONSTRATION** and is not a verified Libro Espresso recipe.

## Created recipes and calculated results

The existing recipe-costing implementation calculated each result from the stored ingredient unit costs. Margin is selling price minus recipe cost, and margin percentage is margin divided by selling price multiplied by 100.

| Product | Variant | Recipe ID | Version | Selling price | Recipe cost | Margin | Margin % | Items |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Americano | Small | `c82de6b2-479b-4d26-ba76-05d4d34468d6` | 1 | ₱119.00 | ₱18.06 | ₱100.94 | 84.82% | 3 |
| Americano | Large | `88978217-0680-4ac5-9012-5a6e98f2089e` | 1 | ₱139.00 | ₱22.84 | ₱116.16 | 83.57% | 3 |
| Café Latte | Small | `ad6b1bf3-4b21-4147-b3e5-aa40784b173c` | 1 | ₱129.00 | ₱41.76 | ₱87.24 | 67.63% | 4 |
| Café Latte | Large | `7e2acb81-d9aa-4acd-86cd-b3a234880758` | 1 | ₱159.00 | ₱54.24 | ₱104.76 | 65.89% | 4 |
| Caramel Macchiato | Small | `d7f8bb3d-b8f4-4043-a968-155502e829a0` | 1 | ₱159.00 | ₱46.56 | ₱112.44 | 70.72% | 5 |
| Caramel Macchiato | Large | `5f1cc458-1878-4b55-a67a-2b6bab74c81d` | 1 | ₱199.00 | ₱60.64 | ₱138.36 | 69.53% | 5 |
| Spanish Latte | Small | `b4c55e03-75bb-45ce-b585-4eaac52b8b7a` | 1 | ₱149.00 | ₱42.96 | ₱106.04 | 71.17% | 5 |
| Spanish Latte | Large | `4f543e31-cd46-4915-b374-0ce2ec2bca60` | 1 | ₱189.00 | ₱57.24 | ₱131.76 | 69.71% | 5 |

## Ingredient identities used

| SKU | Ingredient ID | Ingredient | Inventory unit | Unit cost |
|---|---|---|---:|---:|
| RM-001 | `5479b577-b412-49f2-a142-cca0c726ff11` | Whole Milk | ml | ₱0.1400/ml |
| RM-002 | `12dab4ea-9a75-4152-af36-47ed3424c451` | Espresso Blend Beans | g | ₱0.8200/g |
| RM-003 | `dd44265c-1092-45f1-a6c2-4df9c4b880e7` | Condensed Milk | ml | ₱0.1800/ml |
| RM-005 | `29c547b9-ab2f-4e5d-af2a-9fe0b06acbac` | Caramel Syrup | ml | ₱0.3200/ml |
| RM-006 | `853af707-0dfb-4124-ba23-7d88388f1722` | Filtered Water | ml | ₱0.0100/ml |
| ING-00018 | `e933ac9e-8278-44bb-a6a8-4b2b3f2492b8` | Ice — By Weight | g | ₱0.0100/g |

The Small and Large recipes for each product reuse the same inventory-item IDs while storing distinct quantities in their own variant-specific recipe. No recipe references RM-004 `Ice`.

## Database counts

| Record type | Before | After |
|---|---:|---:|
| Products | 69 | 69 |
| Product variants | 81 | 81 |
| Inventory items | 36 | 36 |
| Recipes | 5 | 13 |
| Recipe items | 16 | 50 |
| POS sources | 0 | 0 |
| POS product/variant mappings | 0 | 0 |

Eight recipe records and 34 recipe-item records were added. No inventory balance was created.

## Safety verification

The import used one serializable transaction and committed only after confirming the final counts and stored recipe contents. Exact snapshots verified that all five existing Standard recipes and their 16 recipe items remained unchanged. Products, variants, ingredient records, costs, branch settings, balances, inventory history, RM-004, POS sources, POS mappings, POS imports, POS sale items, and POS ingredient-usage records were also unchanged.

All eight recipes are attached directly to their intended Small or Large variant, use recipe version 1, contain weighted ice, exclude RM-004, and retain the required sample-data provenance in both the recipe change reason and audit log.
