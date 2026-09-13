# Initial findings: Reddit Activity Lab

Generated from the exported Arctic Shift records on 2026-09-11. All posting windows below use **IST (Asia/Kolkata)**.

## Study scope

The acquisition contains **263,652 unique records: 19,507 posts and 244,145 comments**, from 27 July through 6 September 2026 UTC. The default analysis covers **2026-07-28 through 2026-09-05**, 40 complete local days. The website supports eight timezones. All statements below are observational.

Arctic Shift's public API worked and returned recent records through 11 September 2026 in the coverage probes. No Reddit token or private insight views were used. See [source verification](sources.md) and [verification results](validation.json). The request ledger is generated locally at `dist/data/provenance.json`; record-level exports are excluded from the public repository.

## Community comparison

| Community | Posts | Comments | Median daily participants | Eligible performance posts | Median score | Median comments on a post |
|---|---:|---:|---:|---:|---:|---:|
| r/ClaudeAI | 10,685 | 124,666 | 1,909 | 4,651 | 1 | 7 |
| r/ClaudeCode | 7,061 | 94,112 | 1,422 | 4,720 | 1 | 5 |
| r/ollama | 825 | 5,424 | 98 | 582 | 2 | 2 |

Activity excludes the explicit known-bot list; removed posts still count as captured events. Participation is distinct available authors per day, summarized by the median. Scores and post comment counts use only eligible 35–40-hour archive snapshots. Neither audience size nor personal post views is measured.

## Where and when to test

| Community | Busiest four-hour comment window | Comments/hour | Competing posts/hour in that window | Early-period candidate | Later-period evidence |
|---|---|---:|---:|---|---|
| r/ClaudeAI | 20:00–24:00 | 167.8 | 15.3 | 00:00–04:00 | Uncertain advantage |
| r/ClaudeCode | 20:00–24:00 | 130.8 | 10.2 | 08:00–12:00 | No holdout advantage |
| r/ollama | 20:00–24:00 | 7.3 | 1.1 | 20:00–24:00 | No holdout advantage |

Choose the subreddit by topic and current community rules before considering timing. Cross-community outcome differences do not show that an identical post would perform better elsewhere. ClaudeAI is the broad Claude audience, ClaudeCode is the coding-specific context, and ollama is relevant to local-model workflows. These topic descriptions are orientation, not measured engagement effects.

## r/ClaudeAI

- **Comments:** the highest recurring day/hour was Tue 23:00–24:00, averaging 241 per hour over 6 dates. This is a descriptive maximum selected from 168 cells.
- **Posts:** the highest recurring day/hour was Tue 23:00–24:00, averaging 22.2 per hour over 6 dates. This is a descriptive maximum selected from 168 cells.
- **Distinct participants:** the highest recurring day/hour was Tue 23:00–24:00, averaging 180.5 distinct authors per date/hour over 6 dates. This is a descriptive maximum selected from 168 cells.
- Across weekdays, the peak single clock hour for comments was 21:00 (169.7 comments/hour). The busiest four-hour window was 20:00–24:00. The most competing submissions occurred in 20:00–24:00 (15.3 posts/hour).

The first-half rule selected **00:00–04:00** using a frozen score threshold of **≥ 6** fitted only on dates before 2026-08-17. In the later half, **129/430 (30.0%)** reached it, compared with **513/1804 (28.4%)** in other windows. The difference was **1.6 percentage points**, with a 95% weekly-block bootstrap interval of **-3.0 to 6.6 points**. **Uncertain advantage.**

For a next pilot, compare this window with your usual posting time using distinct, comparable posts, random assignment, and a consistent 36-hour outcome capture. Ten to fifteen naturally occurring posts per arm is a feasibility pilot, not a powered trial. Do not increase posting frequency or duplicate content to satisfy the sample target.

### Descriptive window performance

Success uses each selected local month’s own community-relative score threshold. It is a separate descriptive measure from the frozen-threshold later-half check above.

| IST submission window | Eligible posts | Median score | Median comments | Success rate | 95% Wilson interval |
|---|---:|---:|---:|---:|---|
| 00:00–04:00 | 868 | 1 | 8.5 | 28.5% | 25.6%–31.5% |
| 04:00–08:00 | 633 | 2 | 7 | 28.8% | 25.4%–32.4% |
| 08:00–12:00 | 528 | 1 | 7 | 27.3% | 23.6%–31.2% |
| 12:00–16:00 | 663 | 1 | 8 | 24.3% | 21.2%–27.7% |
| 16:00–20:00 | 897 | 1 | 8 | 23.1% | 20.4%–25.9% |
| 20:00–24:00 | 1062 | 1 | 7 | 24.9% | 22.4%–27.5% |

Monthly thresholds: 2026-07: score ≥ 6 (n=588); 2026-08: score ≥ 7 (n=3420); 2026-09: score ≥ 8 (n=643). Ties can produce more than 25% successes.

### Stability and capture context

| Week beginning | Observed days | Comments/day | Posts/day | Median score | Eligible posts |
|---|---:|---:|---:|---:|---:|
| 2026-07-27 | 6 (partial) | 3,458.8 | 300.5 | 1 | 788 |
| 2026-08-03 | 7 | 2,947.1 | 277.4 | 1 | 805 |
| 2026-08-10 | 7 | 3,376.3 | 253.4 | 1 | 824 |
| 2026-08-17 | 7 | 3,006 | 250.1 | 1 | 725 |
| 2026-08-24 | 7 | 2,710.3 | 247.3 | 1 | 774 |
| 2026-08-31 | 6 (partial) | 3,272.5 | 280.7 | 1 | 735 |

The top 1% of eligible posts accounted for 44.8% of positive score mass; medians reduce that influence. The whole acquisition included 6,317 removed/deleted posts and 9,247 known-bot records. The median second-snapshot age was 36.004 hours. These exclusions and the small number of weeks limit generalization. Monthly and flair comparisons are available in the website.

## r/ClaudeCode

- **Comments:** the highest recurring day/hour was Tue 23:00–24:00, averaging 178.5 per hour over 6 dates. This is a descriptive maximum selected from 168 cells.
- **Posts:** the highest recurring day/hour was Tue 23:00–24:00, averaging 15.7 per hour over 6 dates. This is a descriptive maximum selected from 168 cells.
- **Distinct participants:** the highest recurring day/hour was Tue 23:00–24:00, averaging 146.8 distinct authors per date/hour over 6 dates. This is a descriptive maximum selected from 168 cells.
- Across weekdays, the peak single clock hour for comments was 22:00 (135.4 comments/hour). The busiest four-hour window was 20:00–24:00. The most competing submissions occurred in 20:00–24:00 (10.2 posts/hour).

The first-half rule selected **08:00–12:00** using a frozen score threshold of **≥ 5** fitted only on dates before 2026-08-17. In the later half, **54/258 (20.9%)** reached it, compared with **557/2088 (26.7%)** in other windows. The difference was **-5.7 percentage points**, with a 95% weekly-block bootstrap interval of **-7.8 to -3.9 points**. **No holdout advantage.**

For a next pilot, compare the activity-led 20:00–24:00 window with your usual posting time using distinct, comparable posts, random assignment, and a consistent 36-hour outcome capture. Ten to fifteen naturally occurring posts per arm is a feasibility pilot, not a powered trial. Do not increase posting frequency or duplicate content to satisfy the sample target.

### Descriptive window performance

Success uses each selected local month’s own community-relative score threshold. It is a separate descriptive measure from the frozen-threshold later-half check above.

| IST submission window | Eligible posts | Median score | Median comments | Success rate | 95% Wilson interval |
|---|---:|---:|---:|---:|---|
| 00:00–04:00 | 912 | 1 | 5 | 28.6% | 25.8%–31.6% |
| 04:00–08:00 | 637 | 1 | 5 | 28.3% | 24.9%–31.9% |
| 08:00–12:00 | 520 | 1 | 5 | 26.5% | 22.9%–30.5% |
| 12:00–16:00 | 698 | 1 | 5 | 25.6% | 22.5%–29.0% |
| 16:00–20:00 | 878 | 1 | 5 | 24.5% | 21.8%–27.4% |
| 20:00–24:00 | 1075 | 1 | 5 | 27.2% | 24.6%–29.9% |

Monthly thresholds: 2026-07: score ≥ 3 (n=753); 2026-08: score ≥ 5 (n=3263); 2026-09: score ≥ 6 (n=704). Ties can produce more than 25% successes.

### Stability and capture context

| Week beginning | Observed days | Comments/day | Posts/day | Median score | Eligible posts |
|---|---:|---:|---:|---:|---:|
| 2026-07-27 | 6 (partial) | 2,575.2 | 233.3 | 1 | 945 |
| 2026-08-03 | 7 | 2,537.6 | 183.3 | 1 | 818 |
| 2026-08-10 | 7 | 2,066.3 | 150.7 | 1 | 611 |
| 2026-08-17 | 7 | 2,357 | 151.9 | 1 | 813 |
| 2026-08-24 | 7 | 2,005.6 | 157.6 | 1 | 740 |
| 2026-08-31 | 6 (partial) | 2,649.3 | 192.8 | 2 | 793 |

The top 1% of eligible posts accounted for 41.6% of positive score mass; medians reduce that influence. The whole acquisition included 2,429 removed/deleted posts and 29 known-bot records. The median second-snapshot age was 36.004 hours. These exclusions and the small number of weeks limit generalization. Monthly and flair comparisons are available in the website.

## r/ollama

- **Comments:** the highest recurring day/hour was Sat 01:00–02:00, averaging 12.5 per hour over 6 dates. This is a descriptive maximum selected from 168 cells.
- **Posts:** the highest recurring day/hour was Thu 22:00–23:00, averaging 2.2 per hour over 6 dates. This is a descriptive maximum selected from 168 cells.
- **Distinct participants:** the highest recurring day/hour was Tue 21:00–22:00, averaging 9.7 distinct authors per date/hour over 6 dates. This is a descriptive maximum selected from 168 cells.
- Across weekdays, the peak single clock hour for comments was 01:00 (7.9 comments/hour). The busiest four-hour window was 20:00–24:00. The most competing submissions occurred in 20:00–24:00 (1.1 posts/hour).

The first-half rule selected **20:00–24:00** using a frozen score threshold of **≥ 5** fitted only on dates before 2026-08-17. In the later half, **16/65 (24.6%)** reached it, compared with **60/237 (25.3%)** in other windows. The difference was **-0.7 percentage points**, with a 95% weekly-block bootstrap interval of **-17.0 to 8.1 points**. **No holdout advantage.**

For a next pilot, compare the activity-led 20:00–24:00 window with your usual posting time using distinct, comparable posts, random assignment, and a consistent 36-hour outcome capture. Ten to fifteen naturally occurring posts per arm is a feasibility pilot, not a powered trial. Do not increase posting frequency or duplicate content to satisfy the sample target.

### Descriptive window performance

Success uses each selected local month’s own community-relative score threshold. It is a separate descriptive measure from the frozen-threshold later-half check above.

| IST submission window | Eligible posts | Median score | Median comments | Success rate | 95% Wilson interval |
|---|---:|---:|---:|---:|---|
| 00:00–04:00 | 105 | 1 | 2 | 24.8% | 17.5%–33.8% |
| 04:00–08:00 | 67 | 2 | 2 | 25.4% | 16.5%–36.9% |
| 08:00–12:00 | 66 | 2 | 2.5 | 15.2% | 8.4%–25.7% |
| 12:00–16:00 | 85 | 2 | 3 | 29.4% | 20.8%–39.8% |
| 16:00–20:00 | 124 | 2 | 3 | 28.2% | 21.1%–36.7% |
| 20:00–24:00 | 135 | 2 | 2 | 26.7% | 19.9%–34.7% |

Monthly thresholds: 2026-07: score ≥ 6 (n=59); 2026-08: score ≥ 5 (n=455); 2026-09: score ≥ 6 (n=68). Ties can produce more than 25% successes.

### Stability and capture context

| Week beginning | Observed days | Comments/day | Posts/day | Median score | Eligible posts |
|---|---:|---:|---:|---:|---:|
| 2026-07-27 | 6 (partial) | 128.8 | 20 | 2 | 83 |
| 2026-08-03 | 7 | 114.7 | 17.3 | 2 | 82 |
| 2026-08-10 | 7 | 143.1 | 22.4 | 2 | 115 |
| 2026-08-17 | 7 | 134.6 | 20.1 | 2 | 103 |
| 2026-08-24 | 7 | 142.1 | 22.7 | 2 | 118 |
| 2026-08-31 | 6 (partial) | 151.5 | 21.2 | 2 | 81 |

The top 1% of eligible posts accounted for 29.6% of positive score mass; medians reduce that influence. The whole acquisition included 254 removed/deleted posts and 5 known-bot records. The median second-snapshot age was 36.004 hours. These exclusions and the small number of weeks limit generalization. Monthly and flair comparisons are available in the website.

## What remains unavailable

- Historical online-user counts, silent readership, weekly visitors, and private post-insight views.
- First-24-hour performance or exact lifetime upvote counts.
- A guarantee of archive capture completeness, definitive bot labels, or full moderation history.
- Causal effects of posting time, topic-matched experiments, and long-term seasonal validation.

Read the [full methodology](methodology.md) for the temporal split, thresholds, uncertainty, and confounders. No prospective posting experiment has been completed.
