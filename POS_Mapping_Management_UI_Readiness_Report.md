# POS Mapping Management UI Readiness Report

## Scope

This implementation adds only the Owner-facing first-run configuration and review workflow for POS sources and product/variant mappings. It does not create client POS sources, create mappings, import sales, change a POS parser, or change sales, recipe, COGS, inventory, forecasting, shrinkage, or reporting logic.

## Owner First-Run Workflow

The existing Cost and Sales Management POS area now provides an Owner-only setup panel. The Owner can register an inactive POS source using a source code, display name, and one of the existing supported formats. A source cannot be created as active.

Before activation, the Owner must select the source and explicitly confirm that the supplier export matches the configured format. The backend records the reviewer and verification time. Deactivation clears that verification so a later activation requires another explicit review. Changing the configured format of an active source also requires confirmation of the new format.

## Mapping Review Interface

New mappings are created as inactive and Pending. The interface provides All, Pending, Approved, Rejected, and Ambiguous filters and displays the following review information:

| Review field | Available |
| --- | --- |
| POS product name | Yes |
| POS product code | Yes, when supplied |
| Target Libro product | Yes |
| Target variant | Yes |
| Active recipe availability | Yes |
| Recipe version | Yes, when available |
| Branch scope | Yes; branch name or All branches |
| Review status and note | Yes |

The Owner may approve, reject, mark ambiguous, or return a mapping to Pending. Rejected and Ambiguous decisions require a review note. Only Approved mappings become operationally active.

## Activation Safeguards

Approval is blocked in both the interface and backend when the target variant has no currently effective recipe with valid recipe items. Database trigger protection independently prevents an invalid active mapping.

Approval is blocked when the POS source is inactive or has not completed format verification. Source activation is rejected unless the explicitly confirmed format exactly matches the source's configured format. The existing import preview continues to reject an uploaded file whose detected format does not match the selected source; parser behavior was not changed.

Duplicate active mappings are prevented by the existing scoped unique indexes and by an explicit transactional conflict check during approval. Mapping review is performed in a database transaction and retains the existing audit-log behavior.

Owner-only routing remains in force. Managers and Staff cannot create, activate, or review sources or mappings. Branch-scoped mapping information remains available for future onboarding without changing branch isolation.

## Database Change

Migration `034_pos_mapping_review_workflow.sql` adds source-format review metadata and mapping review status/comment fields. It adds database checks requiring format verification for active sources and Approved status for active mappings, plus a mapping-review index and strengthened active-mapping validation trigger.

The migration contains no seed data. After migration, the application database remained:

| Record | Count |
| --- | ---: |
| Products | 69 |
| Variants | 81 |
| Inventory items | 36 |
| Recipes | 36 |
| Recipe items | 141 |
| POS sources | 0 |
| POS mappings | 0 |
| POS imports | 0 |

## API and Frontend Readiness

The existing source update endpoint now accepts explicit supported-format confirmation during activation. The existing mapping list endpoint accepts an optional review-status filter and returns branch and active-recipe readiness metadata. The existing mapping update endpoint now records one of Pending, Approved, Rejected, or Ambiguous rather than directly toggling operational status.

Frontend types and service calls were aligned with those responses. The review table and activation controls use the existing POS configuration area; no new application module or route was created.

## Verification Results

Backend tests: 321 passed; 5 environment-dependent end-to-end cases remained skipped as they were before this change.

Frontend tests: 68 passed. Focused POS mapping and service regression coverage verifies recipe/source approval eligibility, explicit format-confirmation requests, status filtering, and review-decision payloads.

Backend TypeScript typecheck: passed.

Frontend TypeScript typecheck: passed.

Backend production build: passed.

Frontend production build: passed.

The final database count check confirmed that no source, mapping, or sales import was created.

## Readiness Conclusion

The system is ready for the first client onboarding configuration review. Actual POS sources and mappings must still be entered and verified by the Owner using real supplier export information. No sales import was performed as part of this implementation.
