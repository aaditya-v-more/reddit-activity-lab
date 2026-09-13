# Verification record

Original study verified 11 September 2026 against the acquired dataset.

The public source can be verified without downloading Reddit content: 30 tests use synthetic fixtures, including the temporal-leakage regression. One integration test is skipped until local exports exist, when it also checks the selected dataset across all exported timezones. The historical audit below describes the original dataset, whose records are excluded from the public repository.

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

WebMCP tools registered in the in-app browser. A valid filter configuration updated the same visible analysis and returned its selected interval; invalid input was rejected without changing the previous valid analysis. The read tool returned aggregate counts matching the visible dashboard. Browser support is optional.

The Site is static and has no compilation dependency. HTML entrypoint and asset references were inspected; JavaScript and Python syntax checks passed. Local HTTP preview returned 200. Raw data, SQLite files, and temporary artifacts are ignored by Git. This describes the original private study deployment. The current delivery targets Vercel and omits all bundled study data.

The checks establish reproducible processing of acquired records. They do not establish causal timing effects, complete source capture, ongoing deletion compliance, or a statistically powered posting experiment.

## On-demand acquisition verification — 14 September 2026 IST

The browser-compatible acquisition path returned 242 actual records for r/ollama (17 posts, 225 comments) and 3,744 for r/LocalLLaMA (100 posts, 3,644 comments), for 10 September 2026 IST. All query pages were exhausted, and post/comment totals reconciled against the shared analysis. The latter demonstrates a community beyond the original three. Both checks used the public API with credentials omitted.

Nine additional synthetic-fixture tests cover local-day boundaries, anonymous participant unions, moderation restoration, overlap/deduplication, saturated-second rejection, acquisition failure atomicity, recent versus historical cache expiry, missing-day rejection, and retry/credential behavior. Combined with the existing suite: 31 passing tests when the original dataset is present; 30 passing and one explicitly skipped without it.
