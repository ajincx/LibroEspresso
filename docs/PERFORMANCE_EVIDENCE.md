# Sprint 9 performance evidence

Measurements were taken on September 12, 2026 (Asia/Manila) on Windows x64 with Node.js 24.11.0 and a local PostgreSQL database. Each standard benchmark includes one warm-up followed by three measured iterations. Times below are backend/application processing times and exclude browser rendering and network transit unless explicitly described.

| Test | Manuscript target | Measured result | Status |
|---|---:|---:|---|
| Owner dashboard data | <= 3 seconds | 34.72 ms average; 49.31 ms maximum | PASS |
| Branch Manager dashboard data | <= 3 seconds | 26.44 ms average; 35.86 ms maximum | PASS |
| Consolidated report-support calculations | <= 3 seconds | 24.90 ms average; 31.36 ms maximum | PASS |
| COGS and variance calculations | <= 5 seconds | 79.97 ms average; 110.75 ms maximum | PASS |
| Full 5,000-row POS database import | <= 30 seconds | 1,265.93 ms end to end | PASS |
| Complete all-sections PDF report | <= 15 seconds | 129.14 ms average; 135.51 ms maximum | PASS |
| Complete all-sections XLSX report | <= 15 seconds | 79.99 ms average; 119.18 ms maximum | PASS |
| 5,000-row PDF rendering | <= 15 seconds | 1,917.99 ms average; 2,151.44 ms maximum | PASS |
| 5,000-row XLSX rendering | <= 15 seconds | 248.56 ms average; 275.14 ms maximum | PASS |
| 30-day statistical forecast | <= 10 seconds | 38.03 ms average; 46.72 ms maximum | PASS |
| 90-day statistical forecast | <= 10 seconds | 18.41 ms average; 22.72 ms maximum | PASS |
| 180-day statistical forecast | <= 10 seconds | 17.60 ms average; 19.67 ms maximum | PASS |
| 365-day statistical forecast | <= 10 seconds | 25.54 ms average; 38.18 ms maximum | PASS |
| Gemini response | Normally <= 30 seconds | Not measured because the external Gemini service was not configured. | NOT MEASURED |

The controlled POS benchmark used a separate disposable benchmark database and 5,000 valid deterministic CSV rows. Its measured phases were 85.92 ms parsing, 7.70 ms product lookup, 6.49 ms matching/validation, 5.62 ms duplicate checking, 286.45 ms sale insertion, 761.49 ms ingredient-usage generation, and 1,240.71 ms for the database transaction. The measured HTTP import completed in 1,265.93 ms. Benchmark records were cleaned and the disposable database was removed.

The 5,000-row report result measures a deterministic export fixture approaching the export limit. It verifies renderer capacity, but it is not a claim that the current live database contained 5,000 qualifying report records. Standard monthly report totals include the authorized dataset query and file rendering.

PostgreSQL `EXPLAIN ANALYZE` checks on the current small dataset measured representative POS history, shrinkage, notification, audit, and inventory-count queries below one millisecond. Sequential scans on very small tables were expected. Existing branch/date, count/date, shrinkage scope/date, notification recipient/date, POS identity/date, purchase-order, and recipe-effective-date indexes already cover the primary operational paths. Sprint 9 added only composite audit-log indexes for the existing latest-user-activity and latest-branch-activity lookups; each adds a small storage and insert cost.

These measurements are reproducible with `npm run benchmark:dashboard`, `npm run benchmark:cogs`, `npm run benchmark:reports`, `npm run benchmark:forecast`, and `npm run benchmark:pos-database`. Results from a local development computer do not establish production browser or internet latency. Repeat the commands in the deployed environment and record browser-level page timing before using them as production acceptance evidence.
