# Ingredient Master Proposal — Capstone Demonstration Data

**Review status:** Proposal only. Nothing in this document authorizes an import. These are not Libro Espresso purchasing records, verified recipes, or client-approved ingredient specifications. All new prices below are **SAMPLE / ASSUMED COST — FOR SYSTEM DEMONSTRATION**, in Philippine pesos per stated inventory unit. No recipe quantities are proposed.

**Source checked:** the current application's official 10 categories, 69 products, and 81 variants, plus the six existing inventory records and development seed. The menu lists product names but no ingredient specifications, purchasing invoices, package sizes, or make/buy instructions. “May be used” means a demonstration candidate, **not** a claim about the client's actual preparation.

## 1. Existing Development Ingredients

These six records already exist and originated in the development seed. Their recorded costs are shown for reconciliation only; they are **not verified client costs**, are **not part of the new proposed import**, and must not be overwritten or merged automatically. All six are currently `ACTIVE` and `GLOBAL`.

| SKU | Existing ingredient | Category | Unit | Recorded development-seed cost | Review status | Notes |
| --- | --- | --- | --- | ---: | --- | --- |
| RM-001 | Whole Milk | Dairy | ml | ₱0.1400/ml | EXISTING DEVELOPMENT DATA — REVIEW REQUIRED | Confirm milk identity and price; do not silently rename to Fresh Milk. |
| RM-002 | Espresso Blend Beans | Coffee | g | ₱0.8200/g | EXISTING DEVELOPMENT DATA — REVIEW REQUIRED | Confirm actual blend; do not merge with Barako beans. |
| RM-003 | Condensed Milk | Dairy | ml | ₱0.1800/ml | EXISTING DEVELOPMENT DATA — REVIEW REQUIRED | Confirm whether any menu recipe uses it. |
| RM-004 | Ice | Supplies | pc | ₱0.1000/pc | EXISTING DEVELOPMENT DATA — REVIEW REQUIRED | A “piece” of ice has no defined counting basis. Do not use this row in a recipe until the stock unit is clarified. |
| RM-005 | Caramel Syrup | Syrups | ml | ₱0.3200/ml | EXISTING DEVELOPMENT DATA — REVIEW REQUIRED | Do not assume caramel sauce or salted-caramel topping is the same item. |
| RM-006 | Filtered Water | Beverage Base | ml | ₱0.0100/ml | EXISTING DEVELOPMENT DATA — REVIEW REQUIRED | Confirm whether water is costed and inventoried. |

The existing rows also have branch inventory settings and balances. Existing inventory-related records mean they should be reviewed in place, not deleted and recreated.

## 2. Proposed Ingredients

This is a **candidate demonstration master**, not a complete client bill of materials. Each identity describes a specific proposed stock form so it does not silently collapse unlike goods. Every status is `ACTIVE (PROPOSED ONLY)`—no database status was changed. “May be used” is conditional on later recipe and make/buy confirmation.

| Ingredient name | Category | Inventory unit | Proposed sample unit cost | Cost basis | Active status | Products/menu items where it may be used | Notes/assumptions |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| Granulated Sugar | Dry Goods | g | ₱0.0700/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Prepared drinks, desserts | Generic demonstration sweetener; actual use unverified. |
| Matcha Powder | Beverage Base | g | ₱2.5000/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Matcha Latte | Assumes a dry matcha powder, not a premixed liquid. Confirm form first. |
| Carbonated Water | Beverage Base | ml | ₱0.0600/ml | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Green Apple Soda | Assumes soda is assembled rather than purchased ready-made. |
| Whipping Cream | Dairy | ml | ₱0.3000/ml | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Chilled Chapter drinks; desserts | Only if the demonstration recipe actually uses cream. |
| Dry Spaghetti | Pasta & Noodles | g | ₱0.1600/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Meaty Spaghetti; possibly other pasta | Specific dry-stock form; do not equate with cooked pasta. |
| Dry Lasagna Sheets | Pasta & Noodles | g | ₱0.2800/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Lasagna | Conditional on assembling lasagna in-house. |
| Dry Asian Noodles | Pasta & Noodles | g | ₱0.2000/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Asian Noodles | Distinct from dry spaghetti pending product confirmation. |
| Uncooked Rice | Dry Goods | g | ₱0.0600/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Rice meals | Cost is per gram of **dry** rice; do not apply directly to cooked-rice quantity. |
| Frozen French Fries | Frozen Foods | g | ₱0.1800/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Fries Overload; Salt & Pepper Fries | Assumes frozen purchased fries; confirm preparation. |
| Tortilla Chips | Snacks | g | ₱0.3000/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Nachos Overload | Assumes purchased chips, not in-house tortillas. |
| Garlic | Produce | g | ₱0.1800/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Garlic Pepper Rice; possibly Aglio Y Olio | Candidate seasoning, not a verified recipe component. |
| Cooking Oil | Cooking Supplies | ml | ₱0.1200/ml | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Fried/prepared foods | Assumes recipe-level oil is measured; confirm treatment of shared frying oil. |
| Salt | Seasonings | g | ₱0.0200/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Salt & Pepper Fries; prepared foods | Candidate seasoning. |
| Ground Black Pepper | Seasonings | g | ₱0.7000/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Salt & Pepper Fries; Garlic Pepper Rice | Specific ground-pepper stock form. |
| Butter | Dairy | g | ₱0.4500/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Maple & Butter Waffle; possibly grilled sandwiches | Confirm actual butter versus margarine. |
| Sandwich Bread Slices | Bakery | pc | ₱6.0000/pc | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Clubhouse; grilled sandwiches; Tuna Sandwich | One `pc` means one slice. Confirm bread specification. |
| Burger Bun | Bakery | pc | ₱12.0000/pc | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Cheddar Chapter Cheeseburger | One `pc` means one complete bun. |
| Cheddar Cheese | Dairy | g | ₱0.6000/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Cheddar Chapter Cheeseburger; grilled cheese | Separate from mozzarella; confirm purchased form. |
| Mozzarella Cheese | Dairy | g | ₱0.6500/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Cheese; Hawaiian; Pepperoni Pizza | Only if pizzas are assembled in-house. |
| Pepperoni | Proteins | g | ₱0.7500/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Pepperoni Pizza | Assumes pizza assembly, not finished-pizza purchase. |
| Pineapple Pieces | Produce | g | ₱0.1500/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Hawaiian Pizza | Confirm whether fresh or canned. |
| Bacon | Proteins | g | ₱0.7000/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Bacon Best Seller; possibly Clubhouse | Confirm stock form; do not equate raw and cooked weight. |
| Sliced Ham | Proteins | g | ₱0.4500/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Grilled Ham & Cheese; possibly Hawaiian Pizza | Shared only if both use the same purchased ham. |
| Canned Tuna, Drained | Proteins | g | ₱0.4000/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Tuna Pasta; Tuna Sandwich | Basis is drained edible weight, not can weight. Confirm same stock used. |
| Chicken Eggs | Proteins | pc | ₱9.0000/pc | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Spam & Egg; other egg meals | One `pc` means one egg. |
| Nutella Hazelnut Spread | Toppings | g | ₱0.9000/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Nutella Waffle; Nutella-Almond Croffle | Sample named spread; confirm actual product. |
| Almonds | Toppings | g | ₱0.7500/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Nutella-Almond Croffle | Confirm whole, sliced, or crushed stock form. |
| Biscoff Spread | Toppings | g | ₱0.8500/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Biscoff Croffle | A spread **only**; biscuit would be a separate item if used. |
| Tomatoes | Produce | g | ₱0.1100/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Sandwiches; possibly pizza | Generic demo vegetable; menu does not prove use. |
| Lettuce | Produce | g | ₱0.1800/g | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Sandwiches; burgers | Generic demo vegetable; menu does not prove use. |
| Frozen Chicken Tenders | Frozen Foods | pc | ₱18.0000/pc | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | TLC Tender Chapter; Garlic Pepper Rice w/ Tenders | **MAKE/BUY METHOD TO BE CONFIRMED.** Only suitable if purchased as countable tenders. |
| Frozen Lumpia | Frozen Foods | pc | ₱10.0000/pc | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Garlic Pepper Rice w/ Lumpia | **MAKE/BUY METHOD TO BE CONFIRMED.** One `pc` is one roll. |
| Purchased Beef Patty | Frozen Foods | pc | ₱38.0000/pc | SAMPLE / ASSUMED | ACTIVE (PROPOSED ONLY) | Cheddar Chapter Cheeseburger | **MAKE/BUY METHOD TO BE CONFIRMED.** Use only if bought as standardized patties. |

The table intentionally does **not** add separate products for every suggestive menu word. For example, Chocolate Java Chip alone does not establish whether its stock is chocolate powder, syrup, sauce, chips, or a premix. Those alternatives remain under review below.

## 3. Sample/Assumed Cost Basis

Every new numeric value above is **SAMPLE / ASSUMED COST — FOR SYSTEM DEMONSTRATION**, not a client quote or actual Libro Espresso expense. A value such as ₱0.1600/g means a hypothetical ₱160.00/kg purchase basis; ₱0.3000/ml means a hypothetical ₱300.00/L basis; and ₱12.0000/pc means a hypothetical ₱12.00 for one defined item. These are internally consistent **per inventory unit**. They are not menu selling prices and must not be used to claim actual profitability.

The system's existing costing helper must remain authoritative: recipe quantity is converted to the ingredient's inventory unit, then multiplied by the applicable branch unit cost. No second costing mechanism is proposed. Existing seed prices should be reviewed separately and must not be silently replaced by the samples in this document.

## 4. Unit Review

The supported units are `g`, `kg`, `ml`, `L`, and `pc`. For this proposal, weight-based stock is expressed in `g`, liquids in `ml`, and genuinely countable goods in `pc`. Equivalent kg/L purchases can use the existing conversion logic. A count unit is valid only when **one piece** has a defined physical meaning (egg, bread slice, bun, tender, roll, or patty).

| Candidate or issue | Unit decision | Reason / required confirmation |
| --- | --- | --- |
| Existing Ice (`RM-004`) | **UNIT TO BE CONFIRMED** | `pc` is already stored, but a cube/bag/scoop is undefined; no ice recipe quantity should be entered until clarified. |
| Barako coffee stock | **UNIT TO BE CONFIRMED** | Could be whole beans, grounds, or purchased brewed concentrate; confirm before creating a separate identity. |
| Chamomile, jasmine, and lavender teas | **UNIT TO BE CONFIRMED** | Tea bags (`pc`) and loose tea (`g`) are not equivalent stock forms. |
| Chocolate Java Chip components | **UNIT TO BE CONFIRMED** | Powder/chips may be `g`, while syrup/sauce may be `ml`; identify actual components separately. |
| Green Apple Soda flavor and Strawberry Cream flavor | **UNIT TO BE CONFIRMED** | Could be syrup, puree, powder, or prepared concentrate. |
| Biscoff biscuit, if used | **UNIT TO BE CONFIRMED** | Confirm whether tracked by `pc` or `g`; it is not the proposed spread. |
| Cups and lids | **UNIT TO BE CONFIRMED** | `pc` is appropriate only after actual cup sizes and matching lids are identified; the menu does not establish 12oz/16oz packaging. |
| Bottled Water | **UNIT TO BE CONFIRMED** | `pc` is plausible, but bottle size/SKU must be identified before a separate stock record and sample price are assigned. |
| Rice and pasta | `g` proposed | The table explicitly assumes dry stock; cooked yield belongs to a later recipe decision. |

No new unit or unit-conversion rule is proposed.

## 5. Duplicate/Ambiguous Ingredients

| Candidates | Recommendation and reason |
| --- | --- |
| Whole Milk / Fresh Milk | Keep the existing Whole Milk record unchanged. Verify supplier item and fat/form specification before treating “Fresh Milk” as an alias; do not create a duplicate from wording alone. |
| Espresso Blend Beans / Coffee Beans | Keep the existing specific bean record. Generic “Coffee Beans” is not a second ingredient unless a distinct purchased stock item is established. |
| Barako Beans / Espresso Beans | **Do not merge automatically.** Barako Brew may use a different stock; confirm what is purchased and in what form. |
| Caramel Syrup / Caramel Sauce | **Do not merge automatically.** A pourable syrup and topping sauce can differ in stock form, unit cost, and use. |
| Salted Caramel / Caramel | Treat “Salted Caramel” first as a menu flavor/product description. Confirm whether a distinct salted-caramel stock item exists; do not create one from the name alone. |
| Mozzarella / Cheddar / generic Cheese | Keep mozzarella and cheddar as distinct proposed identities. Do not add generic “Cheese” without a specific purchased product. |
| 12oz Cup / Cup 12oz; 16oz Cup / Cup 16oz | These are likely alternate labels for the **same size-specific stock identity**, but sizes are not established by the menu. Confirm actual packaging before creating either size; never create both word orders. |
| Biscoff Spread / Biscoff Biscuit | Keep distinct if both are actually used: one is a spread, the other a countable/weight-based biscuit. The menu title alone does not prove both. |
| Canned Tuna in pasta / sandwich | Reuse the single proposed tuna record only if both dishes use the same drained stock product; otherwise review separately. |
| Existing Ice / ice by weight | Do not duplicate or change the existing record until its count basis and recipe measurement method are resolved. |

## 6. Prepared/Furnished Product Review

**MAKE/BUY METHOD TO BE CONFIRMED** for the following. If bought finished, the master may represent a countable finished item; if made in-house, its components need separate verified ingredient identities and later variant recipes. Neither route is selected here.

| Menu item or group | Open question before master-data approval |
| --- | --- |
| Bibingka, Blueberry, and Burnt Basque cheesecakes | Bought as finished slices/cakes, or made from ingredients? Confirm size and counting basis. |
| Cheese, Hawaiian, and Pepperoni pizzas | Finished pizza, purchased base with toppings, or made-in-house dough? Confirm before using proposed mozzarella, pepperoni, or pineapple. |
| Lasagna and other pasta dishes | Fully prepared meal, purchased sauce/base, or assembled from dry pasta and ingredients? Confirm cooked-yield method. |
| Croffles, waffles, and pancakes | Purchased bases versus in-house batter; confirm base identity and unit. |
| Chicken tenders and lumpia | Purchased countable pieces versus in-house preparation; proposed frozen items are conditional. |
| Beef patty, pork tapa, pork tocino, sisig, and bangus | Purchased prepared portions versus raw-ingredient preparation; confirm inventory form and unit. |
| Bottled Water | Confirm bottle size and whether it is handled as a purchased finished good. |

## 7. Missing Information

Before **any** later ingredient import or recipe work, confirm the actual item names/SKUs, purchased form and package size, make/buy decisions, inventory unit, branch applicability, and whether two menu items really share the same stock. Actual client costs remain unavailable; all proposed values are demonstration assumptions. Confirm whether the six development rows should remain as demonstration entries, be validated in place, or be retired through a separately approved process. In particular, the development seed currently upserts their master costs if rerun, so it must be reviewed before any future controlled data load.

The current database requires a numeric non-null unit cost. **Do not enter zero as a placeholder for an unknown cost.** Candidates with `UNIT TO BE CONFIRMED` are excluded from the proposed numeric table until their cost basis can be defined. No product recipe, recipe quantity, ingredient consumption, POS mapping, or claimed actual margin can be derived from this proposal alone.

## 8. Recommended Final Ingredient Master

For the capstone demonstration, use the existing shared `inventory_items` structure. First reconcile the six development rows without deleting, duplicating, or overwriting them. Then review each proposed candidate for identity, unit, make/buy method, branch scope, and demonstration cost. Import only approved, uniquely identified candidates through a later controlled step; use one ingredient ID in every applicable variant recipe and store each variant's quantities only in `recipe_items`. Defer all `UNIT TO BE CONFIRMED` identities until resolved. Label all unverified costs and derived demonstration margins as sample data in any presentation.

**Current outcome:** Review document only. No database insert, update, deletion, recipe creation, or system-code change.
