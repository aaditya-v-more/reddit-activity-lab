# Reddit Activity Lab

Analyze subreddit activity, competition between posts, and score differences by submission time. Built by [Aaditya More](https://www.linkedin.com/in/aadityavmore/).

The dashboard accepts **any subreddit covered by Arctic Shift**, with on-demand acquisition, source freshness checks, and persistent browser storage. The deployment contains static application code and small anonymous starter summaries. It has no Reddit corpus, database server, or paid storage. A small optional relay Function handles failed direct connections.

[Initial six-week findings](docs/initial-report.md) · [Methodology](docs/methodology.md) · [Source investigation](docs/sources.md) · [Hosting and scale](docs/hosting.md)

## Run locally

Requires Node.js 18+, Python 3.9+, and a modern browser with Web Workers, IndexedDB, Web Crypto, and IANA timezone support. Acquisition uses the public Arctic Shift API without a Reddit login. Hosted builds and the local development server can relay requests when direct browser access fails. There are no runtime npm dependencies.

```sh
git clone https://github.com/aaditya-v-more/reddit-activity-lab.git
cd reddit-activity-lab
npm test
npm run dev
```

`npm run dev` starts the local server with the same scoped relay used in production. Use `REDDIT_LAB_PORT` to select another port.

Open [localhost:4317](http://127.0.0.1:4317). A dated starter analysis appears immediately; returning visits restore the last saved analysis. Open the subreddit dropdown or type to search Arctic Shift’s directory. Exact names and prefix matches appear first; mouse selection and arrow-key/Enter selection load the chosen community. Recent choices are remembered on the device. Names missing from the directory can still be entered directly. Choose local dates and a timezone to acquire your own interval. IST is the default. First loads can take minutes; subsequent loads reuse completed days. Use **7 days** or **1 day** for very active communities. Only complete acquisitions become findings.

## What “any subreddit” and “fresh” mean

- Subreddit names are not restricted to the original three. Prefix suggestions use the provider's directory, which can lag behind its record archive; direct name entry also works.
- Each acquisition is bounded to **93 days, 200,000 records, and 350 requests**. This is access to selected communities and intervals, not a continuously replicated all-Reddit database. Oversized intervals fail visibly and suggest a shorter range.
- The latest returned post/comment creation times are checked **every 5 minutes while the tab is visible**. These timestamps describe archive freshness, not online users or a complete capture watermark.
- Analysis checks run every **15 minutes while visible**. The last three completed local dates use a 15-minute cache; older dates expire after seven days. Manual **Refresh data** bypasses the cache. Nothing polls when the site is closed.
- The current local day is excluded from timing comparisons. Recent posts without a mature second snapshot contribute to activity, but not to performance. Archive delays and outages can prevent prompt updates; there is no guaranteed push notification from the provider.
- Browser storage holds anonymous day/hour aggregates, redacted public post evidence, and request provenance. The app does not evict completed days or analyses. Freshness checks trigger updates without deleting old results. Persistent storage is requested when supported, but browser quotas, private browsing, or clearing site data can still remove it. If storage fills, existing records are kept and new save failures are visible. **Clear local data** removes downloaded analyses; the theme preference remains. Author names are used transiently in the worker for distinct counts and are not persisted in that cache.

The interface distinguishes activity, participants, online users, and weekly visitors. Net score is not an exact upvote count. Eligible performance snapshots are **35–40 hours old**, not first-24-hour results. Timing relationships are observational.

## Product

- Subreddit discovery, inclusive local date filters, and eight IANA timezones.
- Comment, post, and distinct-participant heatmaps; daily, weekly, and monthly trends.
- Competition by four-hour submission window, median score, median comments, success thresholds, and sample sizes.
- Earlier-half candidate selection with a frozen threshold, followed by a later-half comparison and weekly bootstrap uncertainty.
- Searchable supporting posts, snapshot eligibility, archive freshness, per-day retrieval dates, and downloadable request hashes.
- Loading progress, cancellation, retry, explicit limits, unavailable data, and browser-cache controls.
- System, light, and dark themes with a saved preference; reduced-motion support.

## Architecture

```mermaid
flowchart LR
  API[Arctic Shift public API] --> W[Browser acquisition worker]
  API --> S[Published aggregate starter snapshots]
  S --> UI
  W --> C[Persistent local day cache]
  C --> JS[Shared statistical engine]
  JS --> UI[Static interactive dashboard]
  API --> P[Offline Python adapter]
  P --> RAW[Ignored gzip cache and SHA ledger]
  RAW --> DB[(Local SQLite)]
  DB --> E[Optional saved-study exports]
  E --> JS
  E --> R[Reproducible report]
```

The worker requests one page at a time, reports loading stages and retry delays, spaces calls, respects retries, overlaps timestamp boundaries, and deduplicates record IDs using newer-observation precedence. Both post and comment acquisition must finish before a local day's anonymous aggregate enters the cache. Local-day boundaries come from IANA calendar rules, including IST's half-hour offset and DST's repeated/missing hours. Independent date partitions make recent refreshes smaller than a full re-download.

`dist/` is authored source, not disposable build output. `scripts/build.mjs` copies an explicit asset allowlist into `.output/` and excludes saved-study data. The same static output works on Vercel, Cloudflare Pages, or another static host. Archive requests go directly to Arctic Shift first. If the browser connection fails, Vercel forwards requests through three fixed `/archive/` routes. The relay is a stateless Function: only a scoped public query goes upstream, with all incoming cookies and authorization headers removed. Its invocations, CPU, memory time, and traffic count toward Vercel Hobby quotas. Direct access remains the first choice. Acquisition, aggregation, and statistical calculations run in a Web Worker. Provider limits and visitor bandwidth still apply.

| Layer                                             | Files                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Scoped authenticated relay                        | `api/archive.js`                                                              |
| On-demand acquisition and normalization           | `dist/archive.js`                                                             |
| Background execution and persistent browser cache | `dist/archive-worker.js`                                                      |
| Statistics shared by UI, tests, and reports       | `dist/analysis.js`                                                            |
| Product interface                                 | `dist/app.js`, `dist/index.html`, `dist/style.css`                            |
| Offline acquisition / SQLite / normalization      | `pipeline/`                                                                   |
| Static deployment allowlist                       | `scripts/build.mjs`, `vercel.json`, `.vercelignore`                           |
| Tests                                             | `tests/analysis.test.mjs`, `tests/archive.test.mjs`, `tests/test_pipeline.py` |

## Offline reproducibility and the original study

The original study contains **263,652 unique records: 19,507 posts and 244,145 comments** across r/ClaudeAI, r/ClaudeCode, and r/ollama, acquired for **27 July–6 September 2026 UTC**. Its default analysis covers **28 July–5 September**, 40 complete IST days. The compressed cache was 19.46 MB. These historical findings remain separate from new on-demand observations.

```sh
# Requires curl; end is exclusive and dates are UTC.
python3 -m pipeline.acquire --subreddits ClaudeAI ClaudeCode ollama \
  --start 2026-07-27 --end 2026-09-07
python3 -m pipeline.export
python3 -m pipeline.validate
node scripts/report.mjs

# Rebuild normalization from checksum-verified cached responses, without network.
python3 -m pipeline.rebuild

# Optional small reverse-order source checks.
python3 -m pipeline.validate --online
```

After exporting, the local UI offers **Saved six-week study** as a separate source. Hosted builds omit it. Safe reruns skip completed acquisitions, deduplicate overlap, and retain newer snapshots. Failed intervals do not receive completion flags. A fresh acquisition can differ from the original study because archives change.

The offline source adapter remains replaceable. Map score measurement timestamps only when the source actually supplies them; an ingestion timestamp must not become a supposed fixed-age outcome.

## Verification

`npm test` runs **48 tests without downloaded records** and one additional integration test when saved exports exist. Tests cover pagination ties, newer snapshots, failure completion flags, moderation restoration, bot/deleted-author handling, distinct unions, IST/DST boundaries, cache freshness, acquisition failure handling, Wilson intervals, weekly resampling, and temporal selection leakage.

The on-demand path was also exercised against actual records from **r/ollama and r/LocalLLaMA** for 10 September 2026 IST, acquiring 242 and 3,744 records respectively. Counts reconcile across posts, heatmaps, and daily totals. The original study's [audit](docs/validation.json) records checksum, identity-parity, and 12 reverse-order source checks. Neither audit proves complete Reddit capture.

## Deployment

```sh
npm run build
# Preview only; choose your own account scope when linking.
vercel link
vercel deploy --target preview
# Deploy the current checkout to the production domain.
vercel deploy --prod
```

Production is [reddit-activity-lab.vercel.app](https://reddit-activity-lab.vercel.app/). The Hobby plan supports this personal project. No sub-daily Vercel cron job is configured. See [hosting and free-plan constraints](docs/hosting.md) for the deployment footprint and fallback options.

The GitHub source is public; raw responses, SQLite, `dist/data/`, local deployment configuration, and personal-post notes are ignored. Public source availability does not grant redistribution rights to Reddit content. See [data handling](docs/data-policy.md).

## Starter snapshots

First visits show real aggregate findings for r/ollama, r/ClaudeAI, and r/ClaudeCode, covering **6–12 September 2026** in all eight supported timezones. These snapshots are distinct from acquired post evidence: they contain no authors, post IDs, titles, or bodies. The three IST summaries represent **36,610 records** before bot exclusions. The website clearly displays their period and acquisition date, and keeps them visible while a refresh runs or if the source is unavailable.

```sh
# Acquire a rolling seven-day interval and regenerate all timezone summaries.
npm run starter
# Explicit historical end date; the start is six calendar days earlier.
STARTER_END=2026-09-12 npm run starter
# Bypass the local acquisition cache.
npm run starter -- --refresh
```

The generator uses the same normalizer, timezone boundaries, and statistics as on-demand analysis. Raw normalized responses are retained only under ignored `data/starter/`; publishable summaries live in `dist/starter/`. `npm test` verifies their privacy and reconciles heatmap, daily, and outcome totals before deployment.
