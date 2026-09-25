# Fourth Beverage Recipe Batch Insertion Report

## Scope and provenance

This report records the controlled creation of the 11 authorized Batch 4 beverage recipes. Every recipe, ingredient cost, and quantity is **SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION** and must not be represented as verified Libro Espresso operational data.

For Salted Caramel and Salted Caramel Latte, Caramel Syrup plus Salt is used solely as the approved sample demonstration composition.

## Created recipes and calculated results

| Product | Variant | Recipe ID | Version | Price | Recipe cost | Margin | Margin % |
|---|---|---|---:|---:|---:|---:|---:|
| Salted Caramel Latte | Small | `4d8a0ec7-4de6-4482-80b0-026c75912d07` | 1 | ₱159.00 | ₱46.570 | ₱112.430 | 70.71% |
| Salted Caramel Latte | Large | `79810b5a-9607-479e-a751-91eeee38fe03` | 1 | ₱199.00 | ₱60.655 | ₱138.345 | 69.52% |
| Green Apple Soda | Standard | `1580e32b-035a-4d2a-8a84-ccf9db7a4059` | 1 | ₱159.00 | ₱21.800 | ₱137.200 | 86.29% |
| Strawberry Cream | Small | `b78c1d21-455c-4cea-9cb8-143d9af2defe` | 1 | ₱139.00 | ₱36.200 | ₱102.800 | 73.96% |
| Strawberry Cream | Large | `b53507cf-accc-43b6-8951-8c5d5ca855f1` | 1 | ₱189.00 | ₱51.300 | ₱137.700 | 72.86% |
| Chocolate Java Chip | Small | `979aa5f6-feca-421d-b9ed-b170a472843d` | 1 | ₱139.00 | ₱53.950 | ₱85.050 | 61.19% |
| Chocolate Java Chip | Large | `894184f5-85b1-439f-becc-49d9a09240c0` | 1 | ₱189.00 | ₱74.800 | ₱114.200 | 60.42% |
| Crushed Oreo | Small | `557188d0-8c1a-42df-b214-54a037616ac0` | 1 | ₱139.00 | ₱47.600 | ₱91.400 | 65.76% |
| Crushed Oreo | Large | `ebc636dd-8135-4f87-b9c2-736786e2a1de` | 1 | ₱189.00 | ₱67.700 | ₱121.300 | 64.18% |
| Salted Caramel | Small | `94dc9138-8c7e-4788-bd38-b6d8cccb6adb` | 1 | ₱149.00 | ₱36.610 | ₱112.390 | 75.43% |
| Salted Caramel | Large | `da683641-b24b-4c19-b458-70df7426d231` | 1 | ₱189.00 | ₱51.915 | ₱137.085 | 72.53% |

The existing unit-conversion and recipe-costing implementation produced these values. No new costing or margin formula was introduced.

## Database counts

| Record type | Before | After |
|---|---:|---:|
| Products | 69 | 69 |
| Product variants | 81 | 81 |
| Inventory items | 36 | 36 |
| Recipes | 21 | 32 |
| Recipe items | 82 | 133 |
| POS sources | 0 | 0 |
| POS product/variant mappings | 0 | 0 |

The transaction added 11 recipe records and 51 recipe-item records.

## Protected-record verification

All 21 pre-existing recipes and their 82 recipe items were compared with their full pre-transaction snapshots and remained unchanged. Full snapshots also confirmed no changes to products, variants, inventory items, branch inventory settings, balances, inventory movements, inventory counts, inventory count items, POS sources, POS mappings, POS imports, POS sale items, or historical POS ingredient-usage records.

Every new recipe is version 1, uses `Ice — By Weight` (`ING-00018`), and excludes RM-004. Small and Large recipes share existing ingredient IDs while storing their documented different quantities. No recipe was created for an unresolved or unlisted product.

Each recipe stores the exact provenance **SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION** as its change reason and in its `CREATE_SAMPLE_RECIPE` audit metadata. Salted Caramel recipes additionally identify Caramel Syrup plus Salt as a demonstration-only composition.
