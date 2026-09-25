# POS Source and Product/Variant Mapping Readiness Report

Validation date: September 25, 2026  
Validation mode: Read-only  
Database: `libro_cogs`

## Executive Summary

The existing POS source and product/variant mapping infrastructure is structurally ready for a controlled configuration phase. It supports multiple POS suppliers, exact product identity matching, branch-specific overrides, variant-level targets, Owner review, source/file-format validation, preview-time recipe validation, and a resolution fingerprint that prevents confirmation after a source, mapping, variant, or recipe resolution changes.

No POS source, mapping, import, sale, or ingredient-usage record was created. No application code or parser was changed. This report is the only file created.

## Current POS State

| Record | Verified count |
| --- | ---: |
| POS sources | 0 |
| POS product/variant mappings | 0 |
| POS imports | 0 |
| POS sale items | 0 |

This is consistent with the requested configuration-readiness phase: infrastructure exists, but no supplier identity or product mapping has been configured yet.

## 1. `pos_sources` Table

The table exists and provides the required supplier/source identity and parser-format association.

| Column | Type | Required | Purpose |
| --- | --- | --- | --- |
| `id` | UUID | Yes | Primary key |
| `source_code` | varchar(80) | Yes | Stable, unique source code |
| `display_name` | varchar(160) | Yes | User-facing supplier/source name |
| `supported_format` | varchar(80) | Yes | Parser format expected for the source |
| `status` | `record_status` | Yes | Active/inactive control; defaults to inactive |
| `created_at` | timestamptz | Yes | Creation timestamp |
| `updated_at` | timestamptz | Yes | Last-update timestamp |

The database enforces a unique `source_code`, nonblank source code and display name, and one of these existing parser formats:

- `CANONICAL_CSV`
- `SUMMARY_ITEMS_SOLD_LEGACY_XLS`
- `TRANSACTION_SUMMARY_XLSX`

New sources must be created as inactive. A separate Owner action is required to activate a verified source.

## 2. `pos_product_variant_mappings` Table

The table exists and targets a specific Libro Espresso variant rather than only a parent product.

| Column | Type | Required | Purpose |
| --- | --- | --- | --- |
| `id` | UUID | Yes | Primary key |
| `pos_source_id` | UUID | Yes | Source/supplier identity |
| `branch_id` | UUID | No | Optional branch-specific scope; null means global |
| `source_product_name` | varchar(240) | Yes | Exact POS product name |
| `normalized_source_product_name` | generated varchar(240) | Generated | Trimmed, lowercased, whitespace-normalized identity |
| `source_product_code` | varchar(160) | No | Optional stable POS product code |
| `menu_item_variant_id` | UUID | Yes | Target Libro Espresso variant |
| `status` | `record_status` | Yes | Active/inactive control; defaults to inactive |
| `reviewed_by` | UUID | Required when active | Owner who activated the mapping |
| `reviewed_at` | timestamptz | Required when active | Activation/review timestamp |
| `created_at` | timestamptz | Yes | Creation timestamp |
| `updated_at` | timestamptz | Yes | Used as part of mapping resolution versioning |

Foreign keys protect the source, optional branch, target variant, and reviewing user. Active mappings require review metadata. Partial unique indexes prevent duplicate active identities within the same source and scope:

- If a POS code exists, uniqueness is based on source, branch/global scope, and normalized code.
- Without a POS code, uniqueness is based on source, branch/global scope, and normalized product name.

The activation trigger requires an active POS source, active variant, and active approved parent product. A variant-deactivation trigger deactivates mappings that target a deactivated variant.

## 3. Access-Control Review

The access model is correctly separated between configuration and branch operation.

| Action | Owner | Branch Manager | Staff | Unauthenticated |
| --- | --- | --- | --- | --- |
| View all sources, including inactive | Allowed | No | No | No |
| View active sources for preview | Allowed | Allowed | No | No |
| Create or update a POS source | Allowed | 403 | 403 | 401 |
| View all mappings, including inactive | Allowed | No | No | No |
| View applicable active mappings | Allowed | Assigned branch/global only | No | No |
| Create, activate, or deactivate a mapping | Allowed | 403 | 403 | 401 |
| Open configuration UI | Owner only | Hidden | Hidden | Not applicable |
| Preview or confirm a branch POS import | 403 | Allowed for assigned branch | 403 | 401 |

Therefore, POS source and mapping **administration** is Owner-only. Read access to active configuration is intentionally available to Branch Managers because their import preview needs those records. This does not allow a Branch Manager to create, activate, alter, or deactivate a source or mapping.

## 4. Source Selection During Preview

The current workflow preserves the existing importer and introduces source selection only where required:

`Excel file → existing format detection/parser → selected active POS source → source-format check → active mapping resolution → variant and recipe validation → preview`

For Excel uploads:

1. The Branch Manager selects an active, verified POS source.
2. The backend independently detects the uploaded file format.
3. The selected source must be active and its configured format must equal the detected format.
4. Active global and assigned-branch mappings are loaded for that source.
5. A branch mapping overrides the global mapping for the same identity.
6. An absent source, unavailable source, format mismatch, unmatched item, or ambiguous mapping prevents confirmation.

Canonical CSV retains its existing direct-matching workflow. It is not forced through the Excel supplier-mapping layer. This preserves historical CSV behavior.

The frontend sends the selected source ID in the Excel preview request and presents the resolved source, product, variant, mapping status, mapping scope, validation status, and issues before confirmation.

## 5. Resolution Fingerprint Protection

The protection is present and correctly enforced for Excel confirmation.

The preview creates a SHA-256 resolution fingerprint from:

- selected POS source ID
- resolved parent product ID for each row
- resolved variant ID for each row
- mapping ID for each row
- mapping version, based on mapping ID and `updated_at`
- selected effective recipe version ID

The frontend returns this fingerprint when confirming an Excel import. The backend rebuilds the entire preview inside the import transaction and compares the new fingerprint with the previewed fingerprint. If any protected resolution changed, confirmation fails with `POS_MAPPING_CHANGED` and the user must preview again.

File contents are protected separately through the existing content hash. If the file changed after preview, confirmation fails with `POS_PREVIEW_CHANGED`.

Focused tests verified that the fingerprint changes when the source, target variant, mapping version, or recipe version changes.

## 6. Variant and Recipe Compatibility

The mapping model correctly targets `menu_item_variants.id`. During preview, the backend independently verifies that the resolved variant:

- belongs to the resolved parent product
- is active
- has a recipe effective on the uploaded business date
- has at least one recipe item
- uses units compatible with the corresponding inventory ingredients

Only after those checks does the preview attach the effective recipe version ID. That recipe version is included in the resolution fingerprint and later used to create sale-time ingredient-consumption snapshots.

An important review-stage limitation exists: a mapping may be activated for an active approved variant that does not yet have a recipe. The database activation trigger and mapping controller do not require recipe existence. This does **not** allow invalid sales into the system, because preview marks that row invalid and confirmation is blocked. Nevertheless, the Owner should map only the 36 currently recipe-backed variants until additional recipes are approved.

Current compatibility status:

| Item | Count |
| --- | ---: |
| Total variants | 81 |
| Variants currently eligible by recipe readiness | 36 |
| Variants that must remain unmapped for import | 45 |
| Active mappings currently configured | 0 |

## 7. Parser Preservation

The parser behavior remains unchanged.

The mapping layer operates after the existing CSV/Excel parser returns canonical rows. It does not alter worksheet detection, headers, business date extraction, transaction identity, item identity, quantity, price, line amount, content hashing, duplicate protection, or format-specific import restrictions.

Repository comparison found no changes in the existing CSV parser, Excel parser, mapping service, preview controller, frontend upload module, or frontend request service during this read-only phase.

Focused parser tests passed for:

- canonical CSV parsing and validation
- the 5,000-row safeguard
- Excel signature and extension validation
- supported legacy and transaction-summary workbook structures
- format detection
- blocked aggregate-only formats
- preservation of item-level quantities and selling prices
- prevention of invented prices or allocated transaction totals

## Mapping Resolution Rules

The existing resolver follows safe, explicit rules:

1. Only active mappings are considered.
2. Only the assigned branch or global scope is considered.
3. A branch-specific mapping takes precedence over a global mapping.
4. Names are compared after trim, whitespace normalization, and lowercase normalization.
5. When a POS product code is present, both code and product name must agree.
6. Unknown identities remain unmatched.
7. Multiple matching targets are marked ambiguous rather than guessed.
8. Inactive/unapproved products, inactive variants, and products unavailable at the branch remain unmatched.
9. Missing or incompatible recipes invalidate the preview row.

## Readiness Findings

| Area | Result |
| --- | --- |
| Source schema | READY |
| Mapping schema | READY |
| Owner-only configuration writes | READY |
| Branch Manager preview source selection | READY, awaiting source records |
| Exact and branch-aware resolution | READY, awaiting mapping records |
| Resolution fingerprint protection | READY |
| Variant-specific recipe validation | READY |
| Existing parser preservation | READY |
| Current operational Excel import | NOT YET CONFIGURED: zero sources and zero mappings |

No failed structural or automated checks were found. The system is ready for a later, separately authorized data-configuration phase, but no supplier file can currently be confirmed through the Excel mapping path because no verified source or mapping exists.

## Relevant Test Results

Only focused POS mapping, parser, preview, access-control, and frontend workflow tests were run.

| Test area | Result |
| --- | ---: |
| Backend mapping resolution and fingerprint tests | 9 passed |
| Backend Excel parser tests | 13 passed |
| Backend CSV parser tests | 21 passed |
| Backend POS preview/import safeguard tests | 13 passed |
| Backend access-control integration tests | 32 passed |
| **Backend focused total** | **88 passed** |
| Frontend POS request/source transport tests | 6 passed |
| Frontend Cost and Sales POS UI tests | 5 passed |
| **Frontend focused total** | **11 passed** |
| **Combined focused total** | **99 passed** |

## Recommended Next Phase

Do not create mappings until the supplier sources are reviewed. The next controlled data phase should:

1. Register each verified client POS supplier as an inactive source with the parser format confirmed from its actual sample export.
2. Review and activate each source separately.
3. Prepare a mapping preview using exact POS product names/codes, Libro parent products, variants, branch scope, and recipe readiness.
4. Restrict the first mapping batch to the 36 recipe-backed variants.
5. Keep ambiguous names and all 45 recipe-less variants unmapped.
6. Create mappings as inactive, review them, and activate them only after the proposed targets are verified.
7. Perform a preview-only sample-file validation before authorizing any sales import.

