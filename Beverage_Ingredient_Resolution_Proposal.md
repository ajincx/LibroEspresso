# Beverage Ingredient Resolution Proposal

**Purpose:** Capstone data preparation only. This document does not authorize an ingredient import or recipe creation. It does not describe verified Libro Espresso recipes or purchasing costs.

Every numeric cost in this document is **SAMPLE / ASSUMED COST — FOR SYSTEM DEMONSTRATION**. Every numeric recipe quantity is **SAMPLE / ASSUMED RECIPE QUANTITY — FOR SYSTEM DEMONSTRATION**. A value marked `REVIEW REQUIRED` must not be inserted or used in a recipe.

This proposal reviews all **27 blocked beverage products and 39 blocked variants** from `Recipe_Beverage_Blocker_Resolution.md`. It reuses current ingredient identities where safe, proposes distinct sample identities only when the menu gives a reasonable basis, and retains blockers where a branded product name or stock form is insufficient.

## 1. Current ingredient references

These current records are referenced without changing their IDs, units, or costs. Their costs remain development/sample values rather than client-verified purchasing data.

| Ingredient | Current code | Unit | Current sample cost | Use in this proposal | Review note |
| --- | --- | --- | ---: | --- | --- |
| Whole Milk | RM-001 | ml | ₱0.1400/ml — SAMPLE / ASSUMED | Milk-based beverages | Do not silently rename to Fresh Milk. |
| Espresso Blend Beans | RM-002 | g | ₱0.8200/g — SAMPLE / ASSUMED | Espresso-based drinks | Not automatically equivalent to Barako coffee. |
| Condensed Milk | RM-003 | ml | ₱0.1800/ml — SAMPLE / ASSUMED | Spanish Latte | Existing identity is sufficiently specific. |
| Ice | RM-004 | pc | ₱0.1000/pc — SAMPLE / ASSUMED | Cold beverages | **UNIT REVIEW REQUIRED:** one `pc` is undefined; no Ice quantity is approved. |
| Caramel Syrup | RM-005 | ml | ₱0.3200/ml — SAMPLE / ASSUMED | Caramel beverages | Not automatically a distinct salted-caramel product. |
| Filtered Water | RM-006 | ml | ₱0.0100/ml — SAMPLE / ASSUMED | Brewed/prepared beverages | Not equivalent to a bottled-water finished good. |
| Granulated Sugar | ING-00001 | g | ₱0.0700/g — SAMPLE / ASSUMED | Optional sweetener where composition is approved | Do not add automatically to every drink. |
| Whipping Cream | ING-00002 | ml | ₱0.3000/ml — SAMPLE / ASSUMED | Chilled cream-based demonstrations | Product composition still requires review. |
| Salt | ING-00006 | g | ₱0.0200/g — SAMPLE / ASSUMED | Proposed salted-caramel demonstration composition | Requires explicit recipe-rule approval. |

## 2. Proposed missing ingredient identities

These are proposed identities, not inserted records. Units and prices are capstone assumptions. “Conditional” means the identity is reasonable but must still be accepted before database insertion.

| Proposed ingredient | Proposed unit | Proposed sample cost | Cost/quantity status | Basis and remaining review |
| --- | --- | ---: | --- | --- |
| Barako Coffee Beans | g | ₱0.6500/g — SAMPLE / ASSUMED | Conditional | Reasonable for Barako Brew, but confirm beans versus grounds and whether Espresso Blend Beans may be used instead. |
| Chocolate Beverage Powder | g | ₱0.5000/g — SAMPLE / ASSUMED | Conditional | One explicit demonstration form; do not merge with chocolate syrup, sauce, or chips. |
| Matcha Powder | g | ₱2.5000/g — SAMPLE / ASSUMED | Conditional | Retains the previous proposal value; confirm powder rather than premix. |
| Chamomile Tea Bag | pc | ₱8.0000/pc — SAMPLE / ASSUMED | Conditional | One `pc` means one individually portioned tea bag. |
| Jasmine Tea Bag | pc | ₱8.0000/pc — SAMPLE / ASSUMED | Conditional | One `pc` means one individually portioned tea bag. |
| Lavender Tea Bag | pc | ₱8.0000/pc — SAMPLE / ASSUMED | Conditional | One `pc` means one individually portioned tea bag. |
| White Chocolate Sauce | ml | ₱0.4500/ml — SAMPLE / ASSUMED | Conditional | Explicit sauce identity; not interchangeable with powder or syrup without review. |
| Bottled Water — size/SKU pending | pc | ₱20.0000/pc — SAMPLE / ASSUMED | **REVIEW REQUIRED** | Bottle volume and supplier SKU must be defined before insertion. |
| Green Apple Syrup | ml | ₱0.2500/ml — SAMPLE / ASSUMED | Conditional | Proposed liquid flavor form for a demonstration soda. |
| Carbonated Water | ml | ₱0.0600/ml — SAMPLE / ASSUMED | Conditional | Retains the previous proposal value; confirm the drink is assembled rather than purchased ready-made. |
| Iced Tea Concentrate | ml | ₱0.2000/ml — SAMPLE / ASSUMED | **REVIEW REQUIRED** | Concentrate is only one possible form; powder, tea bags, and ready-to-drink tea are different identities. |
| Java Chips | g | ₱0.7500/g — SAMPLE / ASSUMED | Conditional | Separate from Chocolate Beverage Powder. |
| Oreo Cookie | pc | ₱8.0000/pc — SAMPLE / ASSUMED | **REVIEW REQUIRED** | Confirm cookie SKU and whether count or weight is used operationally. |
| Strawberry Syrup | ml | ₱0.3000/ml — SAMPLE / ASSUMED | Conditional | Proposed explicit liquid form; do not merge with fruit or puree. |
| Coconut Milk | ml | ₱0.1800/ml — SAMPLE / ASSUMED | **REVIEW REQUIRED** | The name Dairy Dose of Coco suggests—but does not prove—a coconut component. |

No proposed item above is a placeholder. Items labeled `REVIEW REQUIRED` are deliberately excluded from any future import until their stock identity is clarified.

## 3. Variant ingredient and quantity proposal

Within the ingredient plans below, every number in parentheses follows the format `unit @ sample cost × sample quantity`. All values are **SAMPLE / ASSUMED**. `Ice — REVIEW REQUIRED` means no Ice quantity has been selected because the current `pc` definition remains unresolved.

| Category | Product | Variant | Required ingredient plan, proposed units, costs, and quantities | Resolution status / review flag |
| --- | --- | --- | --- | --- |
| Warm Tales | Barako Brew | Standard | Barako Coffee Beans (`g` @ ₱0.6500/g × **18g**); Filtered Water (`ml` @ ₱0.0100/ml × **240ml**) | **Conditional:** reasonable sample brew, but approve the distinct Barako identity/form first. |
| Warm Tales | Chocolate | Standard | Chocolate Beverage Powder (`g` @ ₱0.5000/g × **25g**); Whole Milk (`ml` @ ₱0.1400/ml × **200ml**); Granulated Sugar (`g` @ ₱0.0700/g × **10g**) | **Conditional:** powder-based sample composition; chocolate form and optional sugar require approval. |
| Warm Tales | Matcha Latte | Standard | Matcha Powder (`g` @ ₱2.5000/g × **5g**); Whole Milk (`ml` @ ₱0.1400/ml × **200ml**); Granulated Sugar (`g` @ ₱0.0700/g × **10g**) | **Conditional:** approve powder-based composition rather than premix. |
| Warm Tales | Morpheus Pond | Standard | Required ingredients: **REVIEW REQUIRED**; units: **REVIEW REQUIRED**; costs: **REVIEW REQUIRED**; quantities: **REVIEW REQUIRED** | **Blocked:** branded name does not establish a defensible composition. |
| Warm Tales | Pure Chamomile | Standard | Chamomile Tea Bag (`pc` @ ₱8.0000/pc × **1pc**); Filtered Water (`ml` @ ₱0.0100/ml × **250ml**) | **Conditional:** approve individually portioned tea-bag assumption. |
| Warm Tales | Pure Jasmine | Standard | Jasmine Tea Bag (`pc` @ ₱8.0000/pc × **1pc**); Filtered Water (`ml` @ ₱0.0100/ml × **250ml**) | **Conditional:** approve individually portioned tea-bag assumption. |
| Warm Tales | Pure Lavender | Standard | Lavender Tea Bag (`pc` @ ₱8.0000/pc × **1pc**); Filtered Water (`ml` @ ₱0.0100/ml × **250ml**) | **Conditional:** approve individually portioned tea-bag assumption. |
| Cold Classics | Americano | Small | Espresso Blend Beans (`g` @ ₱0.8200/g × **18g**); Filtered Water (`ml` @ ₱0.0100/ml × **180ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Blocked only by Ice definition.** Non-Ice identities and quantities are ready as sample data. |
| Cold Classics | Americano | Large | Espresso Blend Beans (`g` @ ₱0.8200/g × **22g**); Filtered Water (`ml` @ ₱0.0100/ml × **260ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Blocked only by Ice definition.** Quantities intentionally differ from Small. |
| Cold Classics | Café Latte | Small | Espresso Blend Beans (`g` @ ₱0.8200/g × **18g**); Filtered Water (`ml` @ ₱0.0100/ml × **30ml**); Whole Milk (`ml` @ ₱0.1400/ml × **180ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Blocked only by Ice definition.** |
| Cold Classics | Café Latte | Large | Espresso Blend Beans (`g` @ ₱0.8200/g × **22g**); Filtered Water (`ml` @ ₱0.0100/ml × **40ml**); Whole Milk (`ml` @ ₱0.1400/ml × **240ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Blocked only by Ice definition.** Quantities differ from Small. |
| Cold Classics | Caramel Macchiato | Small | Espresso Blend Beans (`g` @ ₱0.8200/g × **18g**); Filtered Water (`ml` @ ₱0.0100/ml × **30ml**); Whole Milk (`ml` @ ₱0.1400/ml × **180ml**); Caramel Syrup (`ml` @ ₱0.3200/ml × **15ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Blocked only by Ice definition.** |
| Cold Classics | Caramel Macchiato | Large | Espresso Blend Beans (`g` @ ₱0.8200/g × **22g**); Filtered Water (`ml` @ ₱0.0100/ml × **40ml**); Whole Milk (`ml` @ ₱0.1400/ml × **240ml**); Caramel Syrup (`ml` @ ₱0.3200/ml × **20ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Blocked only by Ice definition.** Quantities differ from Small. |
| Cold Classics | Spanish Latte | Small | Espresso Blend Beans (`g` @ ₱0.8200/g × **18g**); Filtered Water (`ml` @ ₱0.0100/ml × **30ml**); Whole Milk (`ml` @ ₱0.1400/ml × **150ml**); Condensed Milk (`ml` @ ₱0.1800/ml × **30ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Blocked only by Ice definition.** |
| Cold Classics | Spanish Latte | Large | Espresso Blend Beans (`g` @ ₱0.8200/g × **22g**); Filtered Water (`ml` @ ₱0.0100/ml × **40ml**); Whole Milk (`ml` @ ₱0.1400/ml × **210ml**); Condensed Milk (`ml` @ ₱0.1800/ml × **40ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Blocked only by Ice definition.** Quantities differ from Small. |
| Cold Classics | Chocolate | Small | Chocolate Beverage Powder (`g` @ ₱0.5000/g × **25g**); Whole Milk (`ml` @ ₱0.1400/ml × **180ml**); Granulated Sugar (`g` @ ₱0.0700/g × **10g**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Conditional and blocked:** approve powder/sugar composition and Ice definition. |
| Cold Classics | Chocolate | Large | Chocolate Beverage Powder (`g` @ ₱0.5000/g × **35g**); Whole Milk (`ml` @ ₱0.1400/ml × **240ml**); Granulated Sugar (`g` @ ₱0.0700/g × **15g**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Conditional and blocked:** quantities differ from Small; approve composition and Ice. |
| Cold Classics | Matcha Latte | Small | Matcha Powder (`g` @ ₱2.5000/g × **5g**); Whole Milk (`ml` @ ₱0.1400/ml × **180ml**); Granulated Sugar (`g` @ ₱0.0700/g × **10g**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Conditional and blocked:** approve matcha form and Ice definition. |
| Cold Classics | Matcha Latte | Large | Matcha Powder (`g` @ ₱2.5000/g × **7g**); Whole Milk (`ml` @ ₱0.1400/ml × **240ml**); Granulated Sugar (`g` @ ₱0.0700/g × **15g**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Conditional and blocked:** quantities differ from Small; approve matcha and Ice. |
| Cold Classics | Salted Caramel Latte | Small | Espresso Blend Beans (`g` @ ₱0.8200/g × **18g**); Filtered Water (`ml` @ ₱0.0100/ml × **30ml**); Whole Milk (`ml` @ ₱0.1400/ml × **180ml**); Caramel Syrup (`ml` @ ₱0.3200/ml × **15ml**); Salt (`g` @ ₱0.0200/g × **0.5g**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Proposed existing-item composition:** approve Caramel Syrup + Salt rule and resolve Ice. |
| Cold Classics | Salted Caramel Latte | Large | Espresso Blend Beans (`g` @ ₱0.8200/g × **22g**); Filtered Water (`ml` @ ₱0.0100/ml × **40ml**); Whole Milk (`ml` @ ₱0.1400/ml × **240ml**); Caramel Syrup (`ml` @ ₱0.3200/ml × **20ml**); Salt (`g` @ ₱0.0200/g × **0.75g**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Proposed existing-item composition:** quantities differ from Small; approval and Ice resolution required. |
| Cold Classics | White Mocha Latte | Small | Espresso Blend Beans (`g` @ ₱0.8200/g × **18g**); Filtered Water (`ml` @ ₱0.0100/ml × **30ml**); Whole Milk (`ml` @ ₱0.1400/ml × **180ml**); White Chocolate Sauce (`ml` @ ₱0.4500/ml × **15ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Conditional and blocked:** approve sauce identity and Ice definition. |
| Cold Classics | White Mocha Latte | Large | Espresso Blend Beans (`g` @ ₱0.8200/g × **22g**); Filtered Water (`ml` @ ₱0.0100/ml × **40ml**); Whole Milk (`ml` @ ₱0.1400/ml × **240ml**); White Chocolate Sauce (`ml` @ ₱0.4500/ml × **20ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Conditional and blocked:** quantities differ from Small; approve sauce and Ice. |
| Cold Classics | Bottled Water | Standard | Bottled Water (`pc` @ ₱20.0000/pc × **1pc**) | **Review required:** bottle size/SKU and finished-good treatment must be confirmed; Filtered Water cannot be substituted. |
| Cold Classics | Green Apple Soda | Standard | Green Apple Syrup (`ml` @ ₱0.2500/ml × **20ml**); Carbonated Water (`ml` @ ₱0.0600/ml × **250ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Conditional and blocked:** approve assembled-drink assumption, both identities, and Ice definition. |
| Cold Classics | Iced Tea | Standard | Iced Tea Concentrate (`ml` @ ₱0.2000/ml × **40ml**); Filtered Water (`ml` @ ₱0.0100/ml × **200ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Review required:** concentrate form is only a proposal; resolve tea preparation and Ice. |
| Cold Classics | Midsummer Sangria | Standard | Required ingredients: **REVIEW REQUIRED**; units: **REVIEW REQUIRED**; costs: **REVIEW REQUIRED**; quantities: **REVIEW REQUIRED**; Ice also unresolved | **Blocked:** branded name is insufficient to select fruit, juice, syrup, or beverage base. |
| Cold Classics | She-a-Frooty | Standard | Required ingredients: **REVIEW REQUIRED**; units: **REVIEW REQUIRED**; costs: **REVIEW REQUIRED**; quantities: **REVIEW REQUIRED**; Ice also unresolved | **Blocked:** branded name is insufficient to establish composition. |
| Chilled Chapter | Chocolate Java Chip | Small | Chocolate Beverage Powder (`g` @ ₱0.5000/g × **25g**); Java Chips (`g` @ ₱0.7500/g × **15g**); Whole Milk (`ml` @ ₱0.1400/ml × **160ml**); Whipping Cream (`ml` @ ₱0.3000/ml × **20ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Conditional and blocked:** approve chocolate/chip identities, cream composition, and Ice. |
| Chilled Chapter | Chocolate Java Chip | Large | Chocolate Beverage Powder (`g` @ ₱0.5000/g × **35g**); Java Chips (`g` @ ₱0.7500/g × **20g**); Whole Milk (`ml` @ ₱0.1400/ml × **220ml**); Whipping Cream (`ml` @ ₱0.3000/ml × **30ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Conditional and blocked:** quantities differ from Small; all identities/composition and Ice need approval. |
| Chilled Chapter | Crushed Oreo | Small | Oreo Cookie (`pc` @ ₱8.0000/pc × **2pc**); Whole Milk (`ml` @ ₱0.1400/ml × **170ml**); Whipping Cream (`ml` @ ₱0.3000/ml × **20ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Review required:** confirm cookie SKU/count basis, cream composition, and Ice. |
| Chilled Chapter | Crushed Oreo | Large | Oreo Cookie (`pc` @ ₱8.0000/pc × **3pc**); Whole Milk (`ml` @ ₱0.1400/ml × **230ml**); Whipping Cream (`ml` @ ₱0.3000/ml × **30ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Review required:** quantities differ from Small; confirm cookie, composition, and Ice. |
| Chilled Chapter | Salted Caramel | Small | Caramel Syrup (`ml` @ ₱0.3200/ml × **20ml**); Salt (`g` @ ₱0.0200/g × **0.5g**); Whole Milk (`ml` @ ₱0.1400/ml × **160ml**); Whipping Cream (`ml` @ ₱0.3000/ml × **20ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Proposed existing-item composition:** approve composition and resolve Ice. |
| Chilled Chapter | Salted Caramel | Large | Caramel Syrup (`ml` @ ₱0.3200/ml × **30ml**); Salt (`g` @ ₱0.0200/g × **0.75g**); Whole Milk (`ml` @ ₱0.1400/ml × **220ml**); Whipping Cream (`ml` @ ₱0.3000/ml × **30ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Proposed existing-item composition:** quantities differ from Small; approve composition and resolve Ice. |
| Chilled Chapter | Strawberry Cream | Small | Strawberry Syrup (`ml` @ ₱0.3000/ml × **20ml**); Whole Milk (`ml` @ ₱0.1400/ml × **160ml**); Whipping Cream (`ml` @ ₱0.3000/ml × **20ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Conditional and blocked:** approve syrup-based composition and Ice. |
| Chilled Chapter | Strawberry Cream | Large | Strawberry Syrup (`ml` @ ₱0.3000/ml × **30ml**); Whole Milk (`ml` @ ₱0.1400/ml × **220ml**); Whipping Cream (`ml` @ ₱0.3000/ml × **30ml**); Ice (`pc` @ ₱0.1000/pc × **REVIEW REQUIRED**) | **Conditional and blocked:** quantities differ from Small; approve composition and Ice. |
| The Anthology | Dairy Dose of Coco | Standard | Coconut Milk (`ml` @ ₱0.1800/ml × **REVIEW REQUIRED**); other required ingredients, units, costs, and quantities: **REVIEW REQUIRED** | **Blocked:** coconut identity is only a name-based candidate and the complete composition is unknown. |
| The Anthology | Libro Mood Mover | Standard | Required ingredients: **REVIEW REQUIRED**; units: **REVIEW REQUIRED**; costs: **REVIEW REQUIRED**; quantities: **REVIEW REQUIRED** | **Blocked:** no safe composition can be established from the menu name. |
| The Anthology | The Other Choice | Standard | Required ingredients: **REVIEW REQUIRED**; units: **REVIEW REQUIRED**; costs: **REVIEW REQUIRED**; quantities: **REVIEW REQUIRED** | **Blocked:** no safe composition can be established from the menu name. |

## 4. Resolution groups

### A. Existing ingredients established; Ice decision remains

Eight variants have complete non-Ice ingredient proposals using current records: Small/Large Americano, Café Latte, Caramel Macchiato, and Spanish Latte. They must remain blocked until Ice has a defined physical basis.

### B. Reasonable sample identities proposed, but ingredient approval is required

Barako Coffee Beans, Chocolate Beverage Powder, Matcha Powder, three tea-bag identities, White Chocolate Sauce, Green Apple Syrup, Carbonated Water, Java Chips, and Strawberry Syrup have sufficiently specific proposed forms and supported units. Their costs and quantities are still demonstration assumptions and require review before insertion.

### C. Existing ingredients could resolve composition after explicit business-rule approval

Salted Caramel Latte and Chilled Salted Caramel could use current Caramel Syrup plus Salt as a sample composition. This is not an automatic equivalence to a purchased salted-caramel ingredient. Approval of the composition and resolution of Ice are both required.

### D. Unresolved ingredient form or finished-good treatment

Bottled Water, Iced Tea Concentrate, Oreo Cookie, and Coconut Milk remain review-required because their actual size, form, or role is not established sufficiently for safe insertion.

### E. Composition cannot be inferred safely

Morpheus Pond, Midsummer Sangria, She-a-Frooty, Dairy Dose of Coco, Libro Mood Mover, and The Other Choice require an explicit sample composition or client recipe information. No ingredient list, cost total, or recipe quantity should be generated from their names alone.

## 5. Approval decisions needed before any database work

1. Define the physical meaning of Ice `pc`, or approve a separately reviewed weight-based Ice identity.
2. Approve or reject each conditional ingredient identity and its sample unit cost.
3. Approve or reject the proposed powder-based Chocolate and Matcha formulations.
4. Approve or reject tea bags as the demonstration stock form.
5. Approve or reject Caramel Syrup plus Salt as the sample salted-caramel composition.
6. Confirm bottled-water size/SKU, Oreo tracking basis, and iced-tea stock form.
7. Provide or approve sample compositions for the six branded products that cannot be interpreted safely.

## 6. Current outcome

- Blocked beverage products reviewed: **27**
- Blocked variants represented separately: **39**
- Recipes created: **0**
- Ingredients inserted or updated: **0**
- Ice record modified: **No**
- Database changes: **None**
- Code changes: **None**
