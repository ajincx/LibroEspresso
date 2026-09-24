# Beverage Ingredient Implementation Plan

**Status:** Read-only implementation plan. No database or code change is authorized by this document. No recipe may be created from this plan until the relevant assumptions receive approval.

All proposed prices and quantities are labeled **SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION**. They are not Libro Espresso purchasing prices or verified recipes.

## 1. Current Ice status

The existing Ice inventory record is:

| Field | Current value |
| --- | --- |
| ID | `088f7eab-544b-40a0-83b1-602d6168fe73` |
| SKU | `RM-004` |
| Name | Ice |
| Category | Supplies |
| Unit | `pc` |
| Unit cost | ₱0.1000/pc — development/sample value |
| Reorder level | 500 `pc` |
| Status/scope | Active / Global |

Actual reference inspection found:

| Referencing area | Records | Safety result |
| --- | ---: | --- |
| `recipe_items` | 0 | No current recipe would be altered. |
| `pos_sale_ingredient_usage` | 0 | No sale ingredient snapshot uses Ice. |
| `inventory_movements` | 0 | No receipt or adjustment movement uses Ice. |
| `purchase_order_items` | 0 | No purchase-order item uses Ice. |
| `incident_reports` | 0 | No incident references Ice. |
| `shrinkage_reports` | 0 | No shrinkage record references Ice. |
| `branch_inventory_balances` | 5 | Existing branch quantities are recorded in the current count basis. |
| `branch_inventory_settings` | 5 | Costs and reorder levels are expressed per current `pc`. |
| `inventory_count_items` | 4 | Historical count rows explicitly record unit `piece`. |

The five branch balances currently contain four quantities of 1,000 and one Lipa quantity of 966. Four historical count rows also contain piece-based quantities; the earliest Lipa count includes expected consumption of 34 pieces. Consequently, changing `RM-004.unit` directly to `g` would reinterpret historical pieces, balances, costs, and reorder levels as grams.

The existing application safeguard also rejects unit changes after an ingredient has been used in a balance or inventory count. A direct unit update would bypass that safeguard and damage the meaning of historical data.

### Ice decision

**Do not change `RM-004` from `pc` to `g`.** It is not safe despite having no recipe or POS usage.

The safest demonstration approach is to preserve `RM-004` and later create a distinct global inventory item:

| Proposed identity | Unit | Proposed sample unit cost | Meaning |
| --- | --- | ---: | --- |
| Ice — By Weight | `g` | ₱0.0100/g — **SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION** | A new weight-based demonstration stock identity; equivalent to an assumed ₱10.00/kg. |

This is not a conversion of old Ice. It is a separate identity with a new ID and SKU. Future beverage recipes would reference the weight-based item. `RM-004` would remain available for historical traceability until a separate reconciliation and retirement decision is approved.

No schema migration is required because `g` is already supported and recipe quantities can use it directly.

## 2. Proposed sample Ice quantities

These quantities are **SAMPLE / ASSUMED RECIPE QUANTITY — FOR SYSTEM DEMONSTRATION** and apply only after the weight-based Ice identity is approved and inserted.

| Drink group | Small | Large | Standard | Notes |
| --- | ---: | ---: | ---: | --- |
| Cold Classics coffee and latte drinks | 150g | 220g | Not applicable | Large is intentionally different from Small. |
| Chilled Chapter blended drinks | 180g | 250g | Not applicable | Higher sample quantity reflects a blended-ice demonstration assumption, not a client recipe. |
| Standard iced drinks such as Green Apple Soda or Iced Tea | Not applicable | Not applicable | 180g | May be used only after the drink's remaining ingredients and composition are approved. |
| Bottled Water | None | None | None | A sealed bottled product must not consume recipe Ice. |
| Unresolved branded drinks | REVIEW REQUIRED | REVIEW REQUIRED | REVIEW REQUIRED | Do not apply an Ice quantity until composition is defined. |

## 3. Group A — safe to add as sample/assumed demonstration ingredients

These identities have a specific proposed stock form, a supported unit, and a defined sample cost. “Safe to add” means technically and semantically suitable for a later controlled demonstration-data insertion—not client verified and not authorized for insertion by this plan.

| Proposed ingredient | Unit | Proposed sample cost | Intended blocked products | Required label/assumption |
| --- | --- | ---: | --- | --- |
| Ice — By Weight | g | ₱0.0100/g | All approved cold/blended drinks | Separate from historical `RM-004`; **SAMPLE / ASSUMED** weight basis. |
| Barako Coffee Beans | g | ₱0.6500/g | Barako Brew | Distinct from Espresso Blend Beans; sample bean form. |
| Chocolate Beverage Powder | g | ₱0.5000/g | Hot/Cold Chocolate; Chocolate Java Chip | Powder only; not syrup, sauce, or chips. |
| Matcha Powder | g | ₱2.5000/g | Hot/Cold Matcha Latte | Powder only; not liquid premix. |
| Chamomile Tea Bag | pc | ₱8.0000/pc | Pure Chamomile | One `pc` is one individually portioned tea bag. |
| Jasmine Tea Bag | pc | ₱8.0000/pc | Pure Jasmine | One `pc` is one individually portioned tea bag. |
| Lavender Tea Bag | pc | ₱8.0000/pc | Pure Lavender | One `pc` is one individually portioned tea bag. |
| White Chocolate Sauce | ml | ₱0.4500/ml | White Mocha Latte | Sauce only; do not merge with powder or syrup. |
| Green Apple Syrup | ml | ₱0.2500/ml | Green Apple Soda | Explicit syrup-based sample form. |
| Carbonated Water | ml | ₱0.0600/ml | Green Apple Soda | Assumes the soda is assembled for the demonstration. |
| Java Chips | g | ₱0.7500/g | Chocolate Java Chip | Separate identity from Chocolate Beverage Powder. |
| Oreo Cookie | pc | ₱8.0000/pc | Crushed Oreo | One `pc` is one standard demonstration cookie. |
| Strawberry Syrup | ml | ₱0.3000/ml | Strawberry Cream | Explicit syrup form; not fruit or puree. |

Before a future insertion, each record must be checked against current normalized names and SKUs to prevent duplicates. Each must be global, active, audited with the sample/assumed label, and created without an opening inventory balance. Branch stock should begin only through a later approved count or receipt—not an invented quantity.

## 4. Group B — requires clarification before insertion or use

| Candidate or rule | Current proposal | Clarification required | Database implication after approval |
| --- | --- | --- | --- |
| Bottled Water | `pc`, ₱20.0000/pc sample cost | Confirm bottle volume/SKU and that it is tracked as a purchased finished good. | Add one specifically named finished-good inventory record; do not use Filtered Water. |
| Iced Tea | Iced Tea Concentrate, `ml`, ₱0.2000/ml sample cost | Confirm concentrate versus powder, tea bag, or ready-to-drink stock. | Add only the approved stock form. |
| Coconut Milk | `ml`, ₱0.1800/ml sample cost | Confirm whether Dairy Dose of Coco actually uses it and whether canned/liquid stock is intended. | Add only after composition approval. |
| Salted caramel composition | Existing Caramel Syrup plus existing Salt | Approve or reject this demonstration recipe rule; it is not proof of the client's preparation. | No new salted-caramel ingredient if approved; recipes use the two existing IDs. |
| Whipping Cream in Chilled Chapter | Existing Whipping Cream | Approve its use in each chilled sample composition. | No new ingredient; recipe rule only. |
| Granulated Sugar in beverage recipes | Existing Granulated Sugar | Approve whether the demonstration recipes include added sugar. | No new ingredient; recipe rule only. |
| Existing `RM-004` future status | Preserve active for now | Decide later whether to inactivate after balances/count history are reconciled and all new recipes use weight-based Ice. | Separate controlled status/reconciliation task; never rewrite history. |
| Sample reorder settings | Not yet proposed | Define sample reorder levels/days for new global ingredients before operational demonstration. | Use ordinary branch settings; do not create fake balances. |

## 5. Group C — must remain blocked

The following branded beverages lack a defensible ingredient composition. Their names must not be used to infer ingredients:

| Product | Variant | Blocker | Required resolution |
| --- | --- | --- | --- |
| Morpheus Pond | Standard | No dependable composition | Provide or explicitly approve a complete sample composition. |
| Midsummer Sangria | Standard | Fruit, juice, syrup, and base are unknown | Provide or explicitly approve a complete sample composition. |
| She-a-Frooty | Standard | Fruit/flavor identities are unknown | Provide or explicitly approve a complete sample composition. |
| Dairy Dose of Coco | Standard | Name suggests but does not prove coconut/dairy ingredients | Provide or explicitly approve a complete sample composition. |
| Libro Mood Mover | Standard | No ingredient evidence in the menu name | Provide or explicitly approve a complete sample composition. |
| The Other Choice | Standard | No ingredient evidence in the menu name | Provide or explicitly approve a complete sample composition. |

No ingredient, price, quantity, or recipe should be created for these products until that resolution occurs.

## 6. Proposed controlled database sequence for a later task

This sequence is a plan only:

1. Re-read `inventory_items` and fail if the expected 23-record baseline or existing identities have changed.
2. Verify again that `RM-004` has no recipe or POS usage and preserve all balances, settings, and count history unchanged.
3. Validate every approved Group A name, unit, positive sample cost, and duplicate-normalized identity.
4. Insert only the approved Group A records in one serializable transaction using the existing `inventory_items` architecture.
5. Record **SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION** in audit metadata for every inserted ingredient.
6. Do not create opening balances. If ordinary global-item creation establishes branch settings, use only separately approved sample reorder values and verify no historical record changed.
7. Commit only after products remain 69, variants remain 81, the five existing recipes remain unchanged, POS source/mapping counts remain zero, and protected inventory data matches its pre-transaction snapshot.
8. Stop and report the ingredient insertion. Recipe creation must remain another separately approved transaction.

## 7. Database changes that would eventually be required

- **No schema migration.**
- Insert approved new `inventory_items` records with supported canonical units.
- Add corresponding audit-log entries with explicit sample/assumed provenance.
- Use the existing branch-setting process only after sample reorder settings are approved.
- Do not update `RM-004.unit`, its cost, its balance, its settings, its counts, or its ID.
- Do not insert any `recipes` or `recipe_items` during the ingredient-resolution step.

## 8. Risks and safeguards

| Risk | Safeguard |
| --- | --- |
| Historical Ice pieces become mislabeled as grams | Never update `RM-004.unit`; use a new weight-based identity. |
| Two Ice rows confuse users | Use explicit names such as “Ice — By Weight”; document the historical row and later review its status. |
| Sample costs are presented as client data | Store the exact sample/assumed label in audit metadata and repeat it in demonstrations and reports. |
| Duplicate ingredient identities | Compare normalized names and intended stock forms before insertion; never merge merely similar names. |
| Branch data is fabricated | Do not invent balances; establish stock only through an approved count or receipt. |
| Conditional composition becomes treated as fact | Keep recipe creation separate and require explicit approval of each sample composition. |
| Small and Large use identical quantities | Validate separate quantities; the approved proposal already assigns different weight-based Ice quantities. |
| Existing five recipes lose provenance | Snapshot them and verify their IDs, versions, items, and sample labels before and after any future transaction. |

## 9. Current outcome

- Existing Ice changed: **No**
- Ingredients inserted: **0**
- Recipes created or modified: **0**
- Products or variants modified: **0**
- Inventory balances/settings modified: **0**
- POS, COGS, forecasting, shrinkage, reports, or RBAC modified: **No**
- Recommended Ice approach: **new weight-based demonstration identity; preserve historical `RM-004`**
