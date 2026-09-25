# Recipe Readiness Validation Report

Validation date: September 25, 2026  
Validation mode: Read-only  
Database: `libro_cogs`

## Executive Summary

The current recipe architecture and data passed all ten requested readiness checks. The database contains 36 valid, currently effective recipes covering 36 of 81 variants, or 44.44% variant coverage. The remaining 45 variants correctly have no recipe and therefore return recipe cost and margin as unavailable rather than zero.

No database record or application code was changed during this validation. This report is the only file created.

## Complete Counts

| Record | Verified count |
| --- | ---: |
| Products | 69 |
| Variants | 81 |
| Ingredients | 36 |
| Recipes | 36 |
| Recipe items | 141 |
| Variants with a currently effective recipe | 36 |
| Variants without a recipe | 45 |
| POS sources | 0 |
| POS mappings | 0 |

## Validation Results

| Check | Result | Evidence |
| --- | --- | --- |
| Every recipe belongs to a valid variant | PASS | All 36 recipes reference an existing `menu_item_variants` record, and every recipe's parent product matches the variant's parent product. Invalid references: 0. |
| Every recipe item references an existing ingredient | PASS | All 141 recipe items reference an existing `inventory_items` record. Invalid references: 0. |
| Every recipe quantity uses a supported unit | PASS | All recipe items use supported units. Current usage is 63 `g`, 73 `ml`, and 5 `pc` records. Unsupported units: 0. Non-positive quantities: 0. |
| Variant lookup returns the correct recipe | PASS | The effective-date lookup returned 36 recipes for 36 distinct variant IDs. No parent/variant mismatch or ambiguous effective lookup was found. Existing effective-period tests also passed. |
| Small and Large quantities differ where configured | PASS | All 12 products with both Small and Large recipes use the same ingredient identities across sizes, and every configured ingredient has different Small and Large quantities. |
| Missing recipes return unavailable cost and margin | PASS | The application explicitly returns `null` for recipe cost, margin amount, and margin rate when a variant has no recipe. All 45 missing-recipe variants follow this path. The frontend regression test confirming unavailable margin passed. |
| Recipe costs match stored ingredient costs | PASS | All 36 recipe costs were recomputed using recipe quantity, supported unit conversion, ingredient unit cost, and recipe yield. Every recipe has yield 1, recipe units currently match inventory units, and no conflicting branch cost override exists for a used ingredient. |
| Existing recipes retain sample/assumed provenance | PASS | All 36 recipes retain approved demonstration provenance. Twenty-one use `SAMPLE / ASSUMED RECIPE QUANTITY — FOR SYSTEM DEMONSTRATION`; 15 use `SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION`. Missing provenance: 0. |
| No recipe uses RM-004 Ice | PASS | Recipe-item references to SKU `RM-004`: 0. Cold recipes use the separately defined weight-based ice ingredient where applicable. |
| No duplicate active recipe versions exist | PASS | Duplicate currently effective active recipes per variant: 0. Duplicate variant/version combinations: 0. |

## Failed Checks

None. All requested checks passed.

## Recipe Cost Validation

Recipe cost is not stored as a separate value that could become outdated. The application derives it from the current stored ingredient costs using the existing unit-conversion and yield logic:

`Recipe Cost = SUM((Recipe Quantity converted to Inventory Unit × Ingredient Unit Cost) ÷ Recipe Yield)`

All 36 recipes currently have a yield of 1. Their recipe item units match their inventory units, so no lossy or undefined conversion was required. Recalculated costs produced valid numeric results for all 36 recipes. Margin and margin percentage were then derived using the existing selling price for the correct variant.

## Small/Large Validation

The following 12 products have both Small and Large recipes. Each pair shares ingredient identities, while every configured ingredient quantity differs between the two sizes:

| Product | Shared ingredients | Ingredients with different quantities | Result |
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

## Recipe Coverage by Category

| Category | Total variants | With recipe | Without recipe | Coverage |
| --- | ---: | ---: | ---: | ---: |
| Book Bites | 5 | 0 | 5 | 0.00% |
| Chilled Chapter | 8 | 8 | 0 | 100.00% |
| Cold Classics | 21 | 17 | 4 | 80.95% |
| Fork and Folio | 7 | 0 | 7 | 0.00% |
| Oven Edition | 3 | 0 | 3 | 0.00% |
| Sweet Endings | 8 | 0 | 8 | 0.00% |
| The Anthology | 3 | 0 | 3 | 0.00% |
| The Liter-Egg-y Feast | 7 | 0 | 7 | 0.00% |
| The Stacked Stories | 7 | 0 | 7 | 0.00% |
| Warm Tales | 12 | 11 | 1 | 91.67% |
| **Total** | **81** | **36** | **45** | **44.44%** |

## Variants Still Without Recipes

Missing recipe means the system correctly reports recipe cost and margin as unavailable. It does not imply a zero-cost recipe.

| Category | Product | Variant | Selling price |
| --- | --- | --- | ---: |
| Book Bites | Fries Overload Large | Standard | ₱259.00 |
| Book Bites | Fries Overload Solo | Standard | ₱159.00 |
| Book Bites | Nachos Overload Large | Standard | ₱249.00 |
| Book Bites | Nachos Overload Solo | Standard | ₱159.00 |
| Book Bites | Salt & Pepper Fries | Standard | ₱99.00 |
| Cold Classics | Bottled Water | Standard | ₱50.00 |
| Cold Classics | Iced Tea | Standard | ₱79.00 |
| Cold Classics | Midsummer Sangria | Standard | ₱189.00 |
| Cold Classics | She-a-Frooty | Standard | ₱189.00 |
| Fork and Folio | Aglio Y Olio | Standard | ₱269.00 |
| Fork and Folio | Asian Noodles | Standard | ₱259.00 |
| Fork and Folio | Carbonara | Standard | ₱279.00 |
| Fork and Folio | Lasagna | Standard | ₱269.00 |
| Fork and Folio | Meaty Spaghetti | Standard | ₱259.00 |
| Fork and Folio | Spicy Aglio Y Olio | Standard | ₱279.00 |
| Fork and Folio | Tuna Pasta | Standard | ₱249.00 |
| Oven Edition | Cheese Pizza | Standard | ₱139.00 |
| Oven Edition | Hawaiian Pizza | Standard | ₱139.00 |
| Oven Edition | Pepperoni Pizza | Standard | ₱139.00 |
| Sweet Endings | Bibingka Cheesecake | Standard | ₱189.00 |
| Sweet Endings | Biscoff Croffle | Standard | ₱189.00 |
| Sweet Endings | Blueberry Cheesecake | Standard | ₱229.00 |
| Sweet Endings | Burnt Basque Cheesecake | Standard | ₱229.00 |
| Sweet Endings | Maple & Butter Waffle | Standard | ₱159.00 |
| Sweet Endings | Nutella-Almond Croffle | Standard | ₱189.00 |
| Sweet Endings | Nutella Waffle | Standard | ₱169.00 |
| Sweet Endings | Pancake Pages | Standard | ₱199.00 |
| The Anthology | Dairy Dose of Coco | Standard | ₱209.00 |
| The Anthology | Libro Mood Mover | Standard | ₱219.00 |
| The Anthology | The Other Choice | Standard | ₱219.00 |
| The Liter-Egg-y Feast | Annotated Bangus | Standard | ₱279.00 |
| The Liter-Egg-y Feast | Breakfast Pork Tapa | Standard | ₱269.00 |
| The Liter-Egg-y Feast | Garlic Pepper Rice w/ Lumpia | Standard | ₱279.00 |
| The Liter-Egg-y Feast | Garlic Pepper Rice w/ Tenders | Standard | ₱299.00 |
| The Liter-Egg-y Feast | Sisig Rice Bowl | Standard | ₱259.00 |
| The Liter-Egg-y Feast | Spam & Egg | Standard | ₱229.00 |
| The Liter-Egg-y Feast | Sweet Pork Tocino | Standard | ₱269.00 |
| The Stacked Stories | Bacon Best Seller | Standard | ₱269.00 |
| The Stacked Stories | Cheddar Chapter Cheeseburger | Standard | ₱239.00 |
| The Stacked Stories | Clubhouse Sandwich | Standard | ₱299.00 |
| The Stacked Stories | Grilled Cheese | Standard | ₱149.00 |
| The Stacked Stories | Grilled Ham & Cheese | Standard | ₱199.00 |
| The Stacked Stories | TLC Tender Chapter | Standard | ₱259.00 |
| The Stacked Stories | Tuna Sandwich | Standard | ₱189.00 |
| Warm Tales | Morpheus Pond | Standard | ₱119.00 |

## Regression Verification

The existing test coverage was sufficient; no validation test or application code had to be added.

| Test group | Result |
| --- | --- |
| Recipe effective-period, versioning, variant-parent, and snapshot tests | 15 passed |
| Controlled beverage batch dataset and calculation tests | 16 passed |
| Menu and Recipe unavailable/positive/negative/neutral margin tests | 3 passed |
| **Focused total** | **34 passed** |

## Recommended Next Action

Do not mass-create the remaining 45 recipes. Use the existing completeness and blocker reviews to separate purchased finished goods, products with already-approved ingredients, products requiring new ingredient master records, and products whose composition still requires review. The next controlled batch should contain only variants with a confirmed demonstration composition, supported ingredient identities and units, positive sample costs, and documented sample quantities. Bottled Water, Iced Tea, and composition-review products should remain without recipes until their intended costing or composition rule is explicitly approved.

