# Hosting and scale

Checked 14 September 2026 IST. The owner requested Vercel's free plan and no further ChatGPT Sites deployments.

## What is implemented

The site supports arbitrary Arctic Shift subreddit names through direct browser requests. A Web Worker normalizes and deduplicates records, completes both posts and comments for each local day, then caches anonymous aggregates and redacted post evidence. The statistical engine remains the same one used by the original offline study.

This avoids copying Reddit to the hosting provider. The deployed asset allowlist is roughly 115 KB uncompressed, excluding externally requested fonts. There are zero Vercel Functions, cron jobs, database connections, or paid storage bindings. The browser's calls to Arctic Shift do not transit Vercel. Vercel still meters delivery of the static application, and the source and visitor still bear acquisition traffic.

Daily cache entries expire after 15 minutes for the three most recent completed dates, and seven days for older dates. The visible tab polls source freshness every five minutes and checks analysis caches every 15 minutes. Manual refresh bypasses caches. New post scores generally require the source's approximately 36-hour second observation before becoming eligible. These are polling intervals, not guarantees of immediate updates or complete capture.

No job runs after the browser is closed. There is no verified source webhook in this implementation. Maintaining background synchronization for every subreddit would require a different ingestion service, storage, monitoring, and a realistic budget.

## Free-plan fit and alternatives

| Option                  | Relevant current limits                                                                                                                                                                      | Fit for this project                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Hobby            | 1 million Edge Requests; 4 active CPU-hours, 360 GB-hours memory, 1 million function invocations if functions are used. Function maximum duration 300 seconds. Personal, non-commercial use. | Current target. The implementation uses static delivery only and does not consume function allocations.                             |
| Vercel Hobby cron       | Each cron can run once per day, with hourly scheduling precision.                                                                                                                            | Cannot provide sub-daily archive refresh; no cron is configured.                                                                    |
| Cloudflare Pages Free   | 500 builds/month, 20,000 files/site, 25 MiB maximum asset size.                                                                                                                              | Straightforward static fallback: build with `npm run build`, publish `.output`. No application rewrite or database migration.       |
| Cloudflare Workers Free | Static asset requests are free and unlimited; dynamic Workers have 100,000 requests/day and 10 ms CPU/invocation.                                                                            | Static Assets is another suitable fallback. A full Reddit ingestion/aggregation worker would not fit these dynamic limits reliably. |

Primary references: [Vercel Hobby](https://vercel.com/docs/plans/hobby), [cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

The account's Hobby plan was verified through the Vercel API. No plan upgrade or paid resource was provisioned. Quotas are shared with other projects on the account; this project does not establish unused account capacity.

## Honest scaling boundaries

The interface can request any covered community, but does not promise every community is present or its history is complete. Discovery metadata updates infrequently. Very active communities can make the source time out. Source requests are sequential and spaced, with bounded retries. The documented API has dynamic limits and no uptime guarantees; large corpus processing belongs on the provider's downloadable archives. See the [API contract](https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md).

Per acquisition, the app allows at most 93 local days, 200,000 records, and 350 requests. A limit stops the analysis visibly. Completed cached days remain reusable, but no incomplete cohort is relabeled as a sample. The browser cache is limited to approximately 40 MB and 180 day entries; the main view retains at most six loaded datasets. No combination of these free tiers can provide a complete, perpetually synchronized all-Reddit mirror within this design.

The source's July 2026 corpus download alone was listed at 80.27 GB in the original investigation. Downloading all history merely to serve this dashboard would be unnecessary. If future demand requires shared low-latency analyses, add a separate bounded ingestion service and object-store cache for requested communities, measured against actual usage. The adapter and static frontend are separable, so changing the host does not require rewriting the statistics.

## Deployment procedure

`npm run build` copies only approved static assets to `.output/`. It never copies `dist/data/`, raw responses, SQLite, `.local/`, `.vercel/`, or credentials. `.vercelignore` also excludes local records from source uploads. The hosting configuration sets restrictive source permissions and does not add analytics.

Vercel's project was linked in the owner's account. If GitHub integration lacks repository access, use a direct CLI preview deployment; Git pushes alone will not deploy until that integration is connected. Run `vercel deploy --scope <your-scope>` and inspect its build status. Keep preview authentication enabled when a private preview is desired. Production publication and account access are separate from this public source repository.

For Cloudflare Pages, import the public GitHub repository, choose no framework, set build command `npm run build`, and output directory `.output`. Alternatively upload that output directory. The browser-to-source architecture and all analysis code stay unchanged.
