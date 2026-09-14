# Hosting and scale

Vercel Hobby deployment; limits checked 14 September 2026 IST.

## What is implemented

The site supports arbitrary Arctic Shift subreddit names through direct browser requests, with a same-origin fallback for failed connections. A Web Worker normalizes and deduplicates records, completes both posts and comments for each local day, then caches anonymous aggregates and redacted post evidence. The statistical engine remains the same one used by the original offline study.

This avoids copying Reddit to the hosting provider. The application assets and initial HTML are roughly 823 KB uncompressed, including eight r/funny timezone summaries. There are also 1.69 MB of aggregate starter files across 32 community/timezone combinations. Default-community summaries are embedded at build time for instant timezone switching; other community summaries load only when selected. External fonts are separate. One stateless relay Function is available when direct access fails. There are no database connections or paid storage bindings. Direct requests do not transit Vercel. On a connection failure, three fixed routes reach a scoped relay Function for post search, comment search, and subreddit discovery. Relay traffic and Function invocations, CPU, and memory time count toward Vercel usage. The browser authenticates only to the same-origin site; the Function strips incoming cookies and authorization before requesting the public archive. CDN caching is disabled for these routes so download provenance is not silently replaced by an older hosted response.

Saved analyses and reusable timezone summaries do not expire automatically. Timezone changes reuse them locally, including exact distinct-participant counts. Missing boundary blocks may need overlapping adjacent UTC coverage; a first acquisition includes a boundary buffer so later switches usually stay local. Old single-zone cache entries remain readable but cannot reconstruct other zones. Explicit Refresh data bypasses saved coverage. Opening or leaving the tab open never starts acquisition or freshness polling, and fully cached selections do not check source freshness either. Source freshness is checked after actual network acquisition. New post scores generally require the source's approximately 36-hour second observation before becoming eligible.

No job runs after the browser is closed. There is no verified source webhook in this implementation. Maintaining background synchronization for every subreddit would require a different ingestion service, storage, monitoring, and a realistic budget.

## Free-plan fit and alternatives

| Option                  | Relevant current limits                                                                                                                                                                      | Fit for this project                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Hobby            | 1 million Edge Requests; 4 active CPU-hours, 360 GB-hours memory, 1 million function invocations if functions are used. Function maximum duration 300 seconds. Personal, non-commercial use. | Current target. Application and starter summaries use static delivery; the fallback relay consumes function allocations.                  |
| Vercel Hobby cron       | Each cron can run once per day, with hourly scheduling precision.                                                                                                                            | Cannot provide sub-daily archive refresh; no cron is configured.                                                                          |
| Cloudflare Pages Free   | 500 builds/month, 20,000 files/site, 25 MiB maximum asset size.                                                                                                                              | Static fallback: build with `ARCHIVE_RELAY=0 npm run build`, publish `.output`. Direct archive access must work on the visitor’s network. |
| Cloudflare Workers Free | Static asset requests are free and unlimited; dynamic Workers have 100,000 requests/day and 10 ms CPU/invocation.                                                                            | Static Assets is another suitable fallback. A full Reddit ingestion/aggregation worker would not fit these dynamic limits reliably.       |

Primary references: [Vercel Hobby](https://vercel.com/docs/plans/hobby), [cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

Hobby quotas are shared across the account. Relay use increases request and transfer usage; monitor it before widening limits or adding shared ingestion.

## Scaling boundaries

The interface can request any covered community, but does not promise every community is present or its history is complete. Discovery metadata updates infrequently. Very active communities can make the source time out. Source requests are sequential and spaced, with bounded retries. The documented API has dynamic limits and no uptime guarantees; large corpus processing belongs on the provider's downloadable archives. See the [API contract](https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md).

Per acquisition, the app allows at most 93 local days, 200,000 records, and 350 requests. A limit stops the analysis visibly. Completed cached days remain reusable, but no incomplete cohort is relabeled as a sample. Completed browser analyses are retained until explicitly cleared, subject to browser quota and eviction. The app never evicts older analyses to save newer ones. The main view retains at most six acquired datasets in memory; IndexedDB survives reloads. No combination of these free tiers can provide a complete, perpetually synchronized all-Reddit mirror within this design.

The source's July 2026 corpus download alone was listed at 80.27 GB in the original investigation. Downloading all history merely to serve this dashboard would be unnecessary. If future demand requires shared low-latency analyses, add a separate bounded ingestion service and object-store cache for requested communities, measured against actual usage. The adapter and static frontend are separable, so changing the host does not require rewriting the statistics.

## Deployment procedure

`npm run build` copies application assets and anonymous starter summaries to `.output/reddit/`. It never copies `dist/data/`, raw responses, SQLite, `.local/`, `.vercel/`, or credentials. `.vercelignore` also excludes local records from source uploads. The hosting configuration sets restrictive source permissions and does not add analytics.

Production uses the `main` branch of `aaditya-v-more/reddit-activity-lab` at `https://lab.aadityamore.com/reddit/` through the Lab hub. The Git integration is connected with `main` as the production branch. The build command is `npm test && npm run build`, and the output directory is `.output`.

Commit and push reviewed changes to `main`. Verify the exact pushed Git commit reaches Ready in production and check the public Lab URL, assets and relay routes. Do not run a redundant manual deployment after a successful Git build.

The relay uses three fixed routes and `api/archive.js`, restricted to one subreddit/day per request, a latest-record query, or prefix discovery. It rejects writes and arbitrary destinations, caps responses at 4 MB, and times out upstream requests after 20 seconds. Incoming site credentials never reach Arctic Shift. Browser requests retain source URLs and a `direct` or `relay` transport field in the provenance ledger. Request pacing, retry limits, and acquisition caps apply to direct and relayed requests. The browser includes same-origin credentials on relay requests when Vercel login protection is enabled; the relay excludes them from its upstream request.

For Cloudflare Pages, import the public GitHub repository, choose no framework, set build command `npm run build`, and output directory `.output`. Alternatively upload that output directory. Set `ARCHIVE_RELAY=0` for a host without equivalent relay routes. The analysis code stays unchanged; networks that block direct archive access would need a relay configured on that host.

## Custom domain

The public dashboard uses `https://lab.aadityamore.com/reddit/`. The Lab collection
at `https://lab.aadityamore.com/` is maintained in `aaditya-v-more/resume`, whose
Vercel hub proxies `/reddit/` and its assets to this project's production alias.
This repository remains connected to Vercel's `main` production branch, so a
successful push updates the dashboard without rebuilding the collection hub.

The build packages only application assets and anonymous starter summaries under
`.output/reddit/`. Relative asset, starter and worker URLs support the mounted
path and the existing local development server. The archive relay is exposed at
`/reddit/archive/`; its request and privacy limits are unchanged.

Standalone Vercel homepages permanently redirect to the public dashboard. The
namespaced `/reddit/` origin must remain available for the hub's external rewrite;
redirecting it back to Lab would create a loop. No public portfolio or README link
uses a Vercel address. Keep preview protection enabled.

The build publishes a canonical URL, sharing metadata, the existing public
dashboard preview, robots.txt and a one-page sitemap for the mounted URL. Lab's
sitemap index discovers `/reddit/sitemap.xml` on every source deployment. Cloudflare
DNS and the Lab custom domain belong to the collection hub, not this child project.
The obsolete `reddit.aadityamore.com` domain is removed.
