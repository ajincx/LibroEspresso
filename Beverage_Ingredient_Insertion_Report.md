# Beverage Ingredient Insertion Report

## Scope and provenance

This report records the controlled insertion of the approved Group A beverage ingredients. All 13 records are **SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION** and must not be represented as verified Libro Espresso purchasing costs.

## Inserted ingredients

| Ingredient | ID | SKU | Unit | Sample unit cost | Provenance confirmed |
|---|---|---:|---:|---:|---|
| Ice — By Weight | `e933ac9e-8278-44bb-a6a8-4b2b3f2492b8` | ING-00018 | g | ₱0.0100/g | Yes |
| Barako Coffee Beans | `02d601fb-86eb-4552-9990-104ee882a428` | ING-00019 | g | ₱0.6500/g | Yes |
| Chocolate Beverage Powder | `d35cccf1-1cce-4ec6-9945-a47f69167f14` | ING-00020 | g | ₱0.5000/g | Yes |
| Matcha Powder | `d3216b8f-f5db-4992-9c69-9ac1ff7c446b` | ING-00021 | g | ₱2.5000/g | Yes |
| Chamomile Tea Bag | `01f5796f-2168-4205-a93e-fd833fa82206` | ING-00022 | pc | ₱8.0000/pc | Yes |
| Jasmine Tea Bag | `94b06ec8-0f44-4b3c-99d5-2520cbda499f` | ING-00023 | pc | ₱8.0000/pc | Yes |
| Lavender Tea Bag | `85dcb0ed-258e-45e3-bab8-653b4b00736b` | ING-00024 | pc | ₱8.0000/pc | Yes |
| White Chocolate Sauce | `57a25530-cdfb-4bb0-9c39-3d7ada706d73` | ING-00025 | ml | ₱0.4500/ml | Yes |
| Green Apple Syrup | `9a78e1cf-26e2-4f34-8c42-f91f0aed73db` | ING-00026 | ml | ₱0.2500/ml | Yes |
| Carbonated Water | `ef94cf5e-03f8-4f99-be65-8288a891aee6` | ING-00027 | ml | ₱0.0600/ml | Yes |
| Java Chips | `e783ed66-d4b5-46a8-99de-be5b750d3b93` | ING-00028 | g | ₱0.7500/g | Yes |
| Oreo Cookie | `722995c4-3a84-4f03-80d2-a302cb7cee53` | ING-00029 | pc | ₱8.0000/pc | Yes |
| Strawberry Syrup | `de33d996-e77c-4aad-a027-e50e7ff64adb` | ING-00030 | ml | ₱0.3000/ml | Yes |

Each ingredient has a `CREATE_SAMPLE_INGREDIENT` audit entry whose metadata contains the exact provenance statement **SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION**. All records are active global inventory items. Their per-branch settings retain the same demonstration cost and use a zero reorder level; these settings are configuration records and are not inventory balances.

## Before and after counts

| Record type | Before | After |
|---|---:|---:|
| Products | 69 | 69 |
| Product variants | 81 | 81 |
| Inventory items | 23 | 36 |
| Recipes | 5 | 5 |
| Recipe items | 16 | 16 |
| POS sources | 0 | 0 |
| POS product/variant mappings | 0 | 0 |

The transaction added 13 inventory items and 65 branch inventory setting records, corresponding to 13 ingredients across five active branches. It created zero branch inventory balance records and zero recipes or recipe items.

## RM-004 preservation verification

The existing development record remained unchanged:

| Field | Verified value |
|---|---|
| ID | `088f7eab-544b-40a0-83b1-602d6168fe73` |
| SKU | RM-004 |
| Name | Ice |
| Unit | pc |
| Unit cost | ₱0.1000/pc |
| Reorder level | 500.0000 |
| Status / scope | ACTIVE / GLOBAL |
| Branch balances | 5 |
| Branch settings | 5 |
| Historical count-item records | 4 |
| Recipe references | 0 |
| POS ingredient-usage references | 0 |

`Ice — By Weight` was inserted as a separate inventory identity. RM-004 was not renamed, converted, merged, or otherwise modified.

## Transaction and safety result

The import ran inside one serializable database transaction. It validated the baseline counts, normalized-name uniqueness, supported units, positive costs, protected-record snapshots, inserted-record totals, audit entries, and final database counts before commit. The transaction result was **COMMITTED** with no partial insertion.

The existing 23 inventory records were verified unchanged. No opening balances were created. No products, variants, recipes, recipe items, POS sources, POS mappings, COGS logic, forecasting logic, shrinkage logic, reports, or RBAC behavior were modified.
