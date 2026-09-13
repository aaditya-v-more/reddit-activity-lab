# Methodology

The original six-week study and the current on-demand dashboard share the statistical engine below. The on-demand adapter acquires complete local-day partitions for arbitrary covered communities and caches only anonymous aggregates and redacted post evidence. The current local day is excluded. Each day retains its actual retrieval timestamp; cached dates may have different observation times. The last three completed dates expire after 15 minutes and older dates after seven days, with manual refresh available. See [hosting and freshness](hosting.md) for exact operational limits. These refresh checks do not measure audience presence.

## Populations and intervals

Acquisition uses half-open UTC intervals `[start, end)`. The website accepts inclusive local calendar dates and excludes days whose edges fall outside acquisition. IANA timezones implement IST's half-hour offset and DST transitions. Explicit zero-hour buckets represent no captured activity within an acquired interval; missing acquisition is unavailable, not zero.

Activity includes captured posts and comments, excluding a versioned conservative bot list. Removed posts still count as events. Distinct participation unions authors across posts and comments within each displayed local date/hour. A commenter appearing ten times counts once; unknown and `[deleted]` authors do not become a shared artificial person. Daily counts use a separate union; the overview is the median daily count, never the sum of hourly uniques. No count estimates silent readers.

Post-level comment counts are the archive’s raw public count, including any bot or removed comments counted by Reddit; they differ from the bot-filtered activity-event totals.

Hourly volume is divided by actual hourly exposure. Participant heatmaps average distinct counts per local date/hour window. A DST fall-back local hour is one longer participant window with two hours of activity exposure. Initial and final partial local days are excluded. No DST transition occurs in the delivered study for the supported timezones, but tests exercise both spring and fall.

## Normalization

- Stable identity: `(kind, id)`; comments and posts occupy distinct namespaces.
- Raw responses are gzip-compressed locally with URL, fetch timestamp, byte size, record count, and SHA-256.
- Newer archive observations take precedence; download time is not used as a substitute for score age.
- Restoration metadata overrides stale initial moderation categories. Explicit later removal and removed-body/title markers override restoration.
- Full text bodies never enter the website. Removed titles are suppressed. The site contains no author identities.
- Known bots are an explicit list, not a heuristic based on prolific users or usernames ending in “bot.” Unidentified automation remains a limitation.

## Performance cohort

Only posts with a known second snapshot 35–40 hours after creation, observed net score and comment count, and no removal, pinned, or known-bot exclusion enter performance. Unknown-age posts remain in activity and the record inspector. This is an approximate fixed-age cohort, not an exact 36-hour panel or a 24-hour study.

Conditioning on visible, unremoved posts introduces survivor/moderation selection. A user's real posting risk includes removal; the product displays exclusions rather than treating all observed posts as comparable survivors. Score is net voting, may be fuzzed, and is not an exact count of positive votes.

## Descriptive comparisons

For each subreddit and selected local calendar month, compute the linear-interpolated 75th score percentile among eligible posts. The threshold is its ceiling, with a minimum of 1. Success is `score >= threshold`. Ties mean the success rate can exceed 25%. Month samples can be partial and are shown.

Four-hour local windows pool weekdays. Display sample size, successes, median score, median comments, and the 95% Wilson interval for the success proportion. Windows under 30 posts are flagged as sparse. Hourly activity remains separate from submission-time outcome cohorts.

Medians limit extreme-score influence. The product also shows the share of positive score mass contributed by the top 1% of eligible posts, flair composition, weekly rates, and monthly baselines. These are descriptive sensitivity checks, not adjustment for topic or content quality.

## Candidate selection and later-period check

1. Split selected complete local dates at their midpoint (the later half starts on the midpoint date).
2. Fit one 75th-percentile score threshold on **only the earlier half**, rounded and bounded as above. Freeze it for both halves. This threshold is separate from monthly descriptive thresholds.
3. Among six four-hour windows, require at least 20 eligible posts per half and observations in at least four calendar weeks overall.
4. Select the greatest earlier-half Wilson lower bound (tie-break: earlier local window).
5. Evaluate that candidate against all other windows in the later half using the frozen threshold. Do not pick a replacement based on the later outcomes.
6. Compute a difference interval by resampling calendar-week clusters of later-half posts with replacement, 1,000 deterministic replicates. Retain each cluster's posts together; recompute weighted post-level rates. Report the 2.5th and 97.5th percentiles. Suppress this interval if fewer than three later-half weeks exist.

The first/last week may be partial and are identified. The later split is a diagnostic; it is not an independent prospective validation trial. Few clusters can give unstable bootstrap intervals. Wilson intervals assume independent posts and are not multiplicity-adjusted. No p-values or causal gains are claimed.

“Tentative signal” requires a positive lower endpoint of the later-half cluster interval; “Uncertain advantage” means a positive point difference with remaining uncertainty; “No holdout advantage” means the selected candidate did not beat the later baseline. None promises an engagement improvement.

## Growth, topics, and competition

Daily-normalized weekly/monthly activity and monthly-relative thresholds partly account for changing community scale. They cannot fully distinguish subreddit growth, source coverage changes, product releases, or shifts in participants. Public archive fields do not establish impressions or opportunity to see a post.

Competing submissions are posts created per hour. Comments-per-new-post is a descriptive traffic ratio because comments may belong to older posts; it is not an expected reply count. No subscriber-normalized reach, causal adjustment, topic model, or unverified release attribution is presented.

## Next experiment

Use the candidate as one arm and the user's usual window as another. Randomly assign naturally occurring, distinct comparable posts, balance topic/flair/weekday, obey community rules, and avoid duplicate reposts or artificial frequency increases. A pilot of 10–15 posts per arm explores feasibility; it is not a justified power calculation. Record scores and comment counts at the same age, moderation outcomes, and relevant event context. Keep private view insights separate. Predeclare the comparison and retain failures.
