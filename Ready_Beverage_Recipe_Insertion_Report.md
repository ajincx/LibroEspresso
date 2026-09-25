# Ready Beverage Recipe Batch — Insertion Report

All recipes and quantities in this batch are **SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION**. They are not verified Libro Espresso recipes or purchasing data.

## Transaction result

The controlled import completed in a PostgreSQL `SERIALIZABLE` transaction and was committed only after all baseline, protected-record, recipe-collision, ingredient-identity, unit, cost, and post-insertion checks passed. A full dry run was completed and rolled back before the committed run.

| Record | Before | After |
| --- | ---: | ---: |
| Products | 69 | 69 |
| Variants | 81 | 81 |
| Inventory items | 36 | 36 |
| Recipes | 32 | 36 |
| Recipe items | 133 | 141 |
| POS sources | 0 | 0 |
| POS mappings | 0 | 0 |

## Recipes created

| Product | Variant | Recipe ID | Version | Selling price | Recipe cost | Margin | Margin % |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Barako Brew | Standard | `b1bf27b1-9866-49e9-b9bb-654d2bfb05e3` | 1 | ₱99.00 | ₱14.10 | ₱84.90 | 85.76% |
| Pure Chamomile | Standard | `de882c7a-e1d4-4a0d-b1b8-1b6314cb4aee` | 1 | ₱109.00 | ₱10.50 | ₱98.50 | 90.37% |
| Pure Jasmine | Standard | `6b33fd79-600b-4743-bf29-b2dc26677e40` | 1 | ₱109.00 | ₱10.50 | ₱98.50 | 90.37% |
| Pure Lavender | Standard | `f9569347-b769-42da-acc1-a9db0a8330ed` | 1 | ₱109.00 | ₱10.50 | ₱98.50 | 90.37% |

The existing costing rules produced these values: recipe cost is the sum of each ingredient quantity multiplied by its current unit cost; margin is selling price minus recipe cost; margin percentage is margin divided by selling price multiplied by 100.

## Recipe items created

| Product | Ingredient | Inventory item ID | SKU | Quantity | Unit | Unit cost |
| --- | --- | --- | --- | ---: | --- | ---: |
| Barako Brew | Barako Coffee Beans | `02d601fb-86eb-4552-9990-104ee882a428` | ING-00019 | 18 | g | ₱0.6500/g |
| Barako Brew | Filtered Water | `853af707-0dfb-4124-ba23-7d88388f1722` | RM-006 | 240 | ml | ₱0.0100/ml |
| Pure Chamomile | Chamomile Tea Bag | `01f5796f-2168-4205-a93e-fd833fa82206` | ING-00022 | 1 | pc | ₱8.0000/pc |
| Pure Chamomile | Filtered Water | `853af707-0dfb-4124-ba23-7d88388f1722` | RM-006 | 250 | ml | ₱0.0100/ml |
| Pure Jasmine | Jasmine Tea Bag | `94b06ec8-0f44-4b3c-99d5-2520cbda499f` | ING-00023 | 1 | pc | ₱8.0000/pc |
| Pure Jasmine | Filtered Water | `853af707-0dfb-4124-ba23-7d88388f1722` | RM-006 | 250 | ml | ₱0.0100/ml |
| Pure Lavender | Lavender Tea Bag | `85dcb0ed-258e-45e3-bab8-653b4b00736b` | ING-00024 | 1 | pc | ₱8.0000/pc |
| Pure Lavender | Filtered Water | `853af707-0dfb-4124-ba23-7d88388f1722` | RM-006 | 250 | ml | ₱0.0100/ml |

## Protected-record verification

The import verified all 32 pre-existing recipes and their recipe items remained unchanged. Hash-based pre/post snapshots also confirmed no changes to inventory items, inventory balances, branch inventory settings, inventory movements, inventory counts, inventory count items, products, variants, POS sources, POS mappings, POS imports, POS sale items, or POS ingredient-usage snapshots.

No recipe was created for Iced Tea, Bottled Water, or any of the explicitly blocked composition-review products: Morpheus Pond, Midsummer Sangria, She-a-Frooty, Dairy Dose of Coco, Libro Mood Mover, and The Other Choice.

