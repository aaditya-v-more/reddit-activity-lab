# Verification record

Original study verified 11 September 2026 against the acquired dataset.

The public source can be verified without downloading Reddit content: Tests use synthetic fixtures and the published anonymous starter snapshots, including a temporal-leakage regression. One integration test is skipped until local exports exist, when it also checks the selected dataset across all exported timezones. The historical audit below describes the original dataset, whose records are excluded from the public repository.

- **22 automated tests passed:** 12 JavaScript and 10 Python tests.
- Every cached response SHA-256 matches its ledger entry.
- Unique raw identities exactly match the SQLite records for all six community/type pairs.
- SQLite integrity check passed; all six acquisition intervals are marked complete.
- All exported data files match their manifest SHA-256 hashes.
- Activity totals reconcile across posts, hourly heatmaps, daily series, and outcome cohorts in all eight timezones.
- **12 reverse-order source spot checks** returned exact matching IDs. Intervals were bounded to 10 minutes on two study dates. Three probes were empty in both the source and local store. These spot checks do not prove the archive captured every Reddit event.
- Export privacy assertions confirm no author fields, author hashes, comment bodies, or selftext are present.

Regression cases include repeated timestamp pagination, idempotent reruns, newer snapshot precedence, failed acquisition completion flags, restored moderation states, deleted-author handling, duplicate authors across posts and comments, IST midnight rollover, DST spring gaps and fall repeated hours, Wilson intervals, outliers, missing data, invalid calendar dates, and a test proving later-half scores cannot alter the earlier-half selection threshold.

Browser checks used the local application with the actual exports. Verified community switching, timezone switching, date filtering and recovery from unavailable dates, performance navigation, public post title search, methodology navigation, and mobile layout at a 390×844 viewport override. A detected overflow in the heatmap container was corrected; the final document width matches the mobile viewport. Tables, navigation, and heatmaps retain intentional internal horizontal scrolling.

The application deploys as static assets, with an explicit build allowlist that excludes raw data, SQLite, and saved-study exports. JavaScript and Python syntax checks passed. The original saved-study checks above are separate from verification of on-demand acquisition.

The checks establish reproducible processing of acquired records. They do not establish causal timing effects, complete source capture, ongoing deletion compliance, or a statistically powered posting experiment.

## On-demand acquisition verification — 14 September 2026 IST

The browser-compatible acquisition path returned 242 actual records for r/ollama (17 posts, 225 comments) and 3,744 for r/LocalLLaMA (100 posts, 3,644 comments), for 10 September 2026 IST. All query pages were exhausted, and post/comment totals reconciled against the shared analysis. The latter demonstrates a community beyond the original three. Both checks used the public API with credentials omitted.

Nine additional synthetic-fixture tests cover local-day boundaries, anonymous participant unions, moderation restoration, overlap/deduplication, saturated-second rejection, acquisition failure atomicity, recent versus historical cache expiry, missing-day rejection, and retry/credential behavior. Combined with the existing suite: 31 passing tests when the original dataset is present; 30 passing and one explicitly skipped without it.

## Loading, storage, and theme verification — 14 September 2026

Six regression tests cover blocked direct requests with relay fallback, bounded network retries, timeout versus cancellation, system-theme detection, saved manual overrides, and denied storage. A further test validates all 24 starter summaries, rejects individual-record fields, and reconciles activity and outcome counts. The full suite has 41 passing tests with the original local exports, or 40 passing and one explicit skip without them.

The starter extract used 40,055 records including UTC edges needed for all eight timezones. The displayed IST interval contains 36,610 records: 1,198 in r/ollama, 20,200 in r/ClaudeAI, and 15,212 in r/ClaudeCode. These are actual acquired records; only aggregate summaries and request provenance are published.

Three relay regression tests cover query scoping, credential stripping, redirect refusal, write rejection, and streamed response-size limits.

Browser checks confirmed that a starter analysis renders while source requests are blocked, selecting ClaudeAI loads its matching starter summary, a reload restores that selection and its analysis, and **Clear local data** returns to the bundled starter with a completion message. Light and dark themes were visually reviewed; a saved dark preference survived reload. An initial diagnosis attributed failed acquisition to blocked API navigation. The worker exception investigation below supersedes that diagnosis.

## Browser request regression — 14 September 2026

The browser worker failed before sending requests: storing native `fetch` on an `ArcticClient` instance and invoking it as `this.fetcher()` passed the wrong receiver. Chromium threw `TypeError: Failed to execute 'fetch' on 'WorkerGlobalScope': Illegal invocation`. The catch block hid that exception behind a network-error message and retried both transports. Node fetch and arrow-function mocks did not enforce the browser receiver constraint, so earlier unit checks missed the defect.

The client now invokes fetch with the global receiver. Invocation failures stop once with an application-update message instead of being reported as source outages. Two regression tests cover the native receiver contract and non-retryable invocation failures. The local preview now runs the production relay handler; two tests cover route dispatch and the static file allowlist. A further test verifies original and rewritten relay URLs resolve identically. Total: **46 tests passing**, or 45 passing and one explicit integration skip without local study exports.

After the fix, the browser completed all seven local dates for r/ollama (6–12 September): **1,198 acquired records across 18 requests**. The starter marker disappeared, the new acquisition timestamps were displayed, and the newest post/comment timestamps refreshed successfully.
