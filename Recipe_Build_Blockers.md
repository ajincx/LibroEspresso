# Recipe Build Blockers — First Beverage Batch

This review covers the beverage-oriented categories Warm Tales, Cold Classics, Chilled Chapter, and The Anthology. It records why a product was excluded from the first recipe batch. It does not define client recipes and does not authorize ingredient creation. Suggested additions require a separate Ingredient Master review.

The five eligible Warm Tales products—Americano, Café Latte, Cappuccino, Caramel Macchiato, and Spanish Latte—are intentionally absent from this blocker table because their Standard demonstration recipes use only existing ingredient identities. Cold versions remain blocked because the existing Ice record uses `pc` without defining what one piece represents.

| Category | Product | Variant | Missing or unresolved ingredient | Reason | Suggested Ingredient Master addition or resolution |
| --- | --- | --- | --- | --- | --- |
| Warm Tales | Barako Brew | Standard | Barako coffee stock | Espresso Blend Beans cannot be assumed to be Barako beans. | Confirm Barako beans/grounds identity and choose `g`, or confirm another purchased form. |
| Warm Tales | Chocolate | Standard | Chocolate beverage component | The menu does not identify powder, syrup, sauce, or premix. | Add the confirmed chocolate stock form only. |
| Warm Tales | Matcha Latte | Standard | Matcha component | Matcha Powder was skipped because powder versus premix is unresolved. | Approve a specific matcha powder (`g`) or liquid premix (`ml`). |
| Warm Tales | Morpheus Pond | Standard | Product-specific ingredient specification | The product name does not disclose a safe ingredient identity. | Obtain the ingredient list, then review each missing stock identity. |
| Warm Tales | Pure Chamomile | Standard | Chamomile tea | Tea bag versus loose tea determines `pc` versus `g`. | Confirm the purchased tea form and unit. |
| Warm Tales | Pure Jasmine | Standard | Jasmine tea | Tea bag versus loose tea determines `pc` versus `g`. | Confirm the purchased tea form and unit. |
| Warm Tales | Pure Lavender | Standard | Lavender tea | Tea bag versus loose tea determines `pc` versus `g`. | Confirm the purchased tea form and unit. |
| Cold Classics | Americano | Small, Large | Existing Ice unit definition | `RM-004` uses `pc`, but one piece has no approved physical basis. An incomplete cold recipe was not created. | Define one standardized ice unit or approve a suitable supported inventory basis. |
| Cold Classics | Café Latte | Small, Large | Existing Ice unit definition | The coffee and milk exist, but the cold recipe cannot safely quantify ice. | Resolve `RM-004` without creating a duplicate Ice identity. |
| Cold Classics | Caramel Macchiato | Small, Large | Existing Ice unit definition | Coffee, milk, and caramel syrup exist; ice measurement remains unresolved. | Resolve `RM-004` without creating a duplicate Ice identity. |
| Cold Classics | Spanish Latte | Small, Large | Existing Ice unit definition | Coffee, milk, and condensed milk exist; ice measurement remains unresolved. | Resolve `RM-004` without creating a duplicate Ice identity. |
| Cold Classics | Chocolate | Small, Large | Chocolate beverage component; Ice unit definition | Chocolate form is unknown and ice is not safely measurable. | Approve the specific chocolate stock form and resolve `RM-004`. |
| Cold Classics | Matcha Latte | Small, Large | Matcha component; Ice unit definition | Matcha form and ice basis are unresolved. | Approve matcha stock form and resolve `RM-004`. |
| Cold Classics | Salted Caramel Latte | Small, Large | Salted-caramel component; Ice unit definition | Caramel Syrup cannot automatically be treated as a salted-caramel product. | Confirm a distinct salted-caramel item or an approved composition; resolve `RM-004`. |
| Cold Classics | White Mocha Latte | Small, Large | White-chocolate/mocha component; Ice unit definition | No approved white-mocha stock identity exists. | Confirm powder, sauce, syrup, or premix and resolve `RM-004`. |
| Cold Classics | Bottled Water | Standard | Bottled-water finished-good identity | Bottle size and SKU are not confirmed; Filtered Water is not equivalent. | Add the confirmed bottled-water SKU with a defined `pc` basis. |
| Cold Classics | Green Apple Soda | Standard | Green-apple flavor; carbonated-water form; Ice unit definition | Flavor form and make/buy method are unresolved. | Confirm syrup/puree/premix, carbonated base, and ice basis. |
| Cold Classics | Iced Tea | Standard | Tea base; Ice unit definition | Tea form and ice basis are unresolved. | Confirm brewed tea ingredient or premix and resolve `RM-004`. |
| Cold Classics | Midsummer Sangria | Standard | Product-specific fruit/beverage components; Ice unit definition | The product name is insufficient to identify stock items. | Obtain the ingredient list and resolve ice measurement. |
| Cold Classics | She-a-Frooty | Standard | Product-specific fruit/beverage components; Ice unit definition | The product name is insufficient to identify stock items. | Obtain the ingredient list and resolve ice measurement. |
| Chilled Chapter | Chocolate Java Chip | Small, Large | Chocolate component; java chips; Ice unit definition | The name does not establish chocolate form, chip identity, or measurable ice. | Review separate chocolate and java-chip identities; resolve `RM-004`. |
| Chilled Chapter | Crushed Oreo | Small, Large | Oreo cookie stock; Ice unit definition | Oreo is absent and its count/weight basis is unknown. | Confirm cookie SKU and `pc` or `g` basis; resolve `RM-004`. |
| Chilled Chapter | Salted Caramel | Small, Large | Salted-caramel component; Ice unit definition | Existing Caramel Syrup cannot be silently reclassified. | Confirm actual caramel product/composition and resolve `RM-004`. |
| Chilled Chapter | Strawberry Cream | Small, Large | Strawberry component; Ice unit definition | Fruit, puree, syrup, or powder form is unknown. | Confirm strawberry stock form and resolve `RM-004`. |
| The Anthology | Dairy Dose of Coco | Standard | Product-specific beverage ingredients | The branded name does not establish coconut/dairy stock identities. | Obtain its ingredient list before proposing additions. |
| The Anthology | Libro Mood Mover | Standard | Product-specific beverage ingredients | The branded name does not disclose safe ingredient identities. | Obtain its ingredient list before proposing additions. |
| The Anthology | The Other Choice | Standard | Product-specific beverage ingredients | The branded name does not disclose safe ingredient identities. | Obtain its ingredient list before proposing additions. |

## Summary

- Blocked beverage products: **27**
- Blocked beverage variants: **39**
- Primary recurring blocker: the undefined count basis of existing Ice (`RM-004`)
- Ingredients automatically added: **0**
- Placeholder ingredients created: **0**
- Recipes created by this document: **0**
