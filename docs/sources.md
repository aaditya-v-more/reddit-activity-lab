# Historical source investigation

Checked 11 September 2026. Candidate providers were evaluated directly; availability statements below refer to that verification date.

## Decision

Use **Arctic Shift's public API** for a six-week, three-community extract. Direct requests returned real records through 11 September 2026. The full extraction is in the local ignored response cache; the hosted website acquires selected intervals on demand and caches anonymous participation aggregates and redacted public post evidence in the browser.

| Candidate                          | Verified availability and suitability                                                                                                                                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arctic Shift API                   | Unauthenticated requests work using curl's native TLS. Python urllib received 403 in this environment. No Reddit session is used. Both posts and comments are available for all three communities. Exact probe endpoints and returned boundaries are in `dist/data/manifest.json`.             |
| Arctic Shift downloadable archives | The maintained download list includes monthly releases through July 2026 as checked. July's Academic Torrents entry lists 80.27 GB total: 23.21 GB submissions and 57.06 GB comments. No torrent was downloaded. Stream compressed JSONL and filter by subreddit if adopting this route later. |
| Pushshift API                      | Reddit's official access page requires approved moderators and limits usage to moderation use cases. This analytics task does not qualify on that basis; no access request was made.                                                                                                           |
| Older Pushshift-derived downloads  | Older releases exist in the archive catalog, including a top-40k-subreddit collection ending December 2023. Such older archives cannot establish recent coverage for newer communities like ClaudeCode. Not downloaded or relied on.                                                           |

## Fields and timing

The successful post responses contain IDs, subreddit, author, creation epoch, title, flair, net score, comment count, initial `retrieved_on`, and `_meta.retrieved_2nd_on`. Comments are acquired with only ID, subreddit, author, creation epoch, and initial retrieval time. Full post responses are necessary because the documented selectable-field list does not include `_meta`.

Arctic Shift documents an initial collection and, for November 2023 onward, a second collection about 36 hours later. Selected outcome fields are updated, while some initial metadata survives. Therefore, `retrieved_on` alone is **not** the score observation timestamp. Post eligibility uses the actual second timestamp, restricted to 35–40 hours. These are neither final scores nor 24-hour outcomes.

Restoration is consequential: `_meta.was_initially_deleted` can indicate later approval even when `removed_by_category` still describes initial filtering. The normalizer honors restoration, then gives explicit later-deletion, removed body, or removed-title markers precedence. Tests cover that merge behavior.

## Access, limits, and reproducibility

The API supports fixed limits up to 100, or `auto` returning 100–1,000 on a full page depending on capacity. It documents dynamic rate limiting, no uptime guarantees, and rate-reset response headers. The adapter uses one sequential request stream, a pause between requests, retry backoff, and provider reset guidance on 429. Requests specify subreddit and a bounded time range.

Pagination overlaps the last timestamp second, deduplicates IDs, and stops only at an uncapped page or an empty response. Records, raw SHA-256 hashes, fetched times, archive retrieval times, and request URLs are retained. The saved responses occupy 19.46 MB compressed (117.30 MB uncompressed), including overlapping pages. See the validation report for exact byte counts. The complete Reddit corpus is never acquired.

A day-aggregation request returned zero counts despite nonzero directly retrieved records. This inconsistent aggregate response was not used. All dashboard calculations derive from individual acquired records; independent validation compares exact IDs against small reverse-order search queries.

## Missingness and rights

Public/private access, moderation, removals, outages, and archive removal requests affect capture. Endpoint minimum and maximum dates do not prove continuous coverage. Exhausting query pages does not prove all Reddit records were captured. Missing authors are excluded from distinct counts, and retained removed records still contribute to activity totals. Exact deletion timing may be unknown.

No explicit dataset redistribution license was found in the checked root documentation or July torrent metadata (its license field is blank). The repository root `LICENSE` request returned 404. This is an unresolved rights question, not evidence of public-domain status. Obtain provider guidance before redistributing archive datasets. Hosted builds contain application code only.

## Primary references

- [Arctic Shift repository and access overview](https://github.com/ArthurHeitmann/arctic_shift)
- [API fields, pagination, and limits](https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md)
- [Collection, merged observations, and restoration metadata](https://github.com/ArthurHeitmann/arctic_shift/blob/master/file_content_explanations.md)
- [Archive release catalog](https://github.com/ArthurHeitmann/arctic_shift/blob/master/download_links.md)
- [July 2026 archive sizes and metadata](https://academictorrents.com/details/e04a4fda12826ab1d181eef6512b36aca63c70ff)
- [Official Pushshift access requirements](https://support.reddithelp.com/hc/en-us/articles/16470271632404-Pushshift-Access-Request)

## Optional live counts

No current online count was obtained in this project, and no Reddit session credential was accessed. Even a working live endpoint would require repeated future observations; it would not provide past online counts. The historical platform works independently of that enhancement.

## Expansion check — 14 September 2026 IST

The public API returned `Access-Control-Allow-Origin: *`, enabling direct browser acquisition without a hosting proxy or Reddit credentials. Subreddit prefix search and direct community names are supported. The directory itself updates infrequently, so an absent suggestion does not establish absent post/comment coverage.

The new adapter exhausted one complete IST day's queries for r/ollama and r/LocalLLaMA on 10 September 2026: respectively 242 and 3,744 records. A separate latest-record probe also returned a recent LocalLLaMA post. This establishes a usable fourth community, not complete coverage of all subreddits.

An additional aggregate query returned nonzero hourly counts, unlike the earlier aggregate probe. Bare date strings were interpreted with an offset, so the on-demand adapter consistently sends numeric UTC epoch boundaries derived from the selected IANA timezone. The expanded dashboard continues to compute volume and distinct participants from acquired records, rather than mixing upstream aggregate definitions with its bot exclusions.
