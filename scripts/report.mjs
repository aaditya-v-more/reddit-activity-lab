import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, DAYS } from "../dist/analysis.js";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "dist/data/manifest.json")),
);
const options = {
  start: manifest.defaultStart,
  end: manifest.defaultEnd,
  zone: "Asia/Kolkata",
};
const fmt = (x) =>
  x == null
    ? "unavailable"
    : Number(x).toLocaleString("en-US", { maximumFractionDigits: 1 });
const pct = (x) => (x == null ? "unavailable" : (x * 100).toFixed(1) + "%");
const window = (w) =>
  `${String(w.start).padStart(2, "0")}:00–${String(w.end).padStart(2, "0")}:00`;
const pp = (x) => (x * 100).toFixed(1);
const findings = [];
for (const c of manifest.communities) {
  const d = JSON.parse(fs.readFileSync(path.join(root, "dist/data", c.file)));
  const r = analyze(d, options),
    peaks = Object.fromEntries(
      ["meanComments", "meanPosts", "meanAuthors"].map((m) => [
        m,
        [...r.heat].sort((a, b) => b[m] - a[m])[0],
      ]),
    );
  const hourlyPeaks = Object.fromEntries(
    ["comments", "posts", "authors"].map((m) => [
      m,
      [...r.hourly].sort((a, b) => b[m] - a[m])[0],
    ]),
  );
  const commentWindow = [...r.windows].sort(
      (a, b) => b.commentsPerHour - a.commentsPerHour,
    )[0],
    competitionWindow = [...r.windows].sort(
      (a, b) => b.postsPerHour - a.postsPerHour,
    )[0];
  findings.push({
    subreddit: c.name,
    coverage: d.coverage,
    audit: d.audit,
    analysisStart: r.start,
    analysisEnd: r.end,
    days: r.days,
    totals: r.totals,
    thresholds: r.thresholds,
    discoveryThreshold: r.discoveryThreshold,
    midpoint: r.midpoint,
    peaks,
    hourlyPeaks,
    commentWindow,
    competitionWindow,
    recommendation: r.recommendation,
    windows: r.windows,
    weeks: r.weeks,
    monthly: r.monthly,
    topScoreShare: r.topShare,
  });
}
const total = manifest.communities.reduce((s, c) => s + c.records, 0),
  postTotal = manifest.communities.reduce((s, c) => s + c.posts, 0),
  commentTotal = manifest.communities.reduce((s, c) => s + c.comments, 0);
let md = `# Initial findings: Reddit Activity Lab\n\nGenerated from the exported Arctic Shift records on ${manifest.generatedAt.slice(0, 10)}. All posting windows below use **IST (Asia/Kolkata)**.\n\n## Study scope\n\nThe acquisition contains **${fmt(total)} unique records: ${fmt(postTotal)} posts and ${fmt(commentTotal)} comments**, from 27 July through 6 September 2026 UTC. The default analysis covers **${options.start} through ${options.end}**, 40 complete local days. The website supports eight timezones. All statements below are observational.\n\nArctic Shift's public API worked and returned recent records through 11 September 2026 in the coverage probes. No Reddit token or private insight views were used. See [source verification](sources.md) and [verification results](validation.json). The request ledger is generated locally at \`dist/data/provenance.json\`; record-level exports are excluded from the public repository.\n\n## Community comparison\n\n| Community | Posts | Comments | Median daily participants | Eligible performance posts | Median score | Median comments on a post |\n|---|---:|---:|---:|---:|---:|---:|\n`;
for (const f of findings)
  md += `| r/${f.subreddit} | ${fmt(f.totals.posts)} | ${fmt(f.totals.comments)} | ${fmt(f.totals.medianDailyAuthors)} | ${fmt(f.totals.n)} | ${fmt(f.totals.score)} | ${fmt(f.totals.medianComments)} |\n`;
md +=
  "\nActivity excludes the explicit known-bot list; removed posts still count as captured events. Participation is distinct available authors per day, summarized by the median. Scores and post comment counts use only eligible 35–40-hour archive snapshots. Neither audience size nor personal post views is measured.\n\n## Where and when to test\n\n| Community | Busiest four-hour comment window | Comments/hour | Competing posts/hour in that window | Early-period candidate | Later-period evidence |\n|---|---|---:|---:|---|---|\n";
for (const f of findings)
  md += `| r/${f.subreddit} | ${window(f.commentWindow)} | ${fmt(f.commentWindow.commentsPerHour)} | ${fmt(f.commentWindow.postsPerHour)} | ${f.recommendation ? window(f.recommendation) : "Insufficient sample"} | ${f.recommendation?.label || "Unavailable"} |\n`;
md +=
  "\nChoose the subreddit by topic and current community rules before considering timing. Cross-community outcome differences do not show that an identical post would perform better elsewhere. ClaudeAI is the broad Claude audience, ClaudeCode is the coding-specific context, and ollama is relevant to local-model workflows. These topic descriptions are orientation, not measured engagement effects.\n";
for (const f of findings) {
  md += `\n## r/${f.subreddit}\n\n`;
  for (const [m, label] of [
    ["meanComments", "Comments"],
    ["meanPosts", "Posts"],
    ["meanAuthors", "Distinct participants"],
  ]) {
    const p = f.peaks[m];
    md += `- **${label}:** the highest recurring day/hour was ${DAYS[p.day]} ${String(p.hour).padStart(2, "0")}:00–${String(p.hour + 1).padStart(2, "0")}:00, averaging ${fmt(p[m])} ${m === "meanAuthors" ? "distinct authors per date/hour" : "per hour"} over ${p.occurrences} dates. This is a descriptive maximum selected from 168 cells.\n`;
  }
  md += `- Across weekdays, the peak single clock hour for comments was ${String(f.hourlyPeaks.comments.hour).padStart(2, "0")}:00 (${fmt(f.hourlyPeaks.comments.comments)} comments/hour). The busiest four-hour window was ${window(f.commentWindow)}. The most competing submissions occurred in ${window(f.competitionWindow)} (${fmt(f.competitionWindow.postsPerHour)} posts/hour).\n`;
  const w = f.recommendation;
  if (w) {
    md += `\nThe first-half rule selected **${window(w)}** using a frozen score threshold of **≥ ${f.discoveryThreshold}** fitted only on dates before ${f.midpoint}. In the later half, **${w.test.k}/${w.test.n} (${pct(w.test.rate)})** reached it, compared with **${w.baseline.k}/${w.baseline.n} (${pct(w.baseline.rate)})** in other windows. The difference was **${pp(w.delta)} percentage points**${w.deltaCI ? `, with a 95% weekly-block bootstrap interval of **${pp(w.deltaCI[0])} to ${pp(w.deltaCI[1])} points**` : ""}. **${w.label}.**\n\nFor a next pilot, compare ${w.delta > 0 ? "this window" : `the activity-led ${window(f.commentWindow)} window`} with your usual posting time using distinct, comparable posts, random assignment, and a consistent 36-hour outcome capture. Ten to fifteen naturally occurring posts per arm is a feasibility pilot, not a powered trial. Do not increase posting frequency or duplicate content to satisfy the sample target.\n`;
  } else
    md +=
      "\nThe split-period sample does not satisfy the minimum evidence rule for selecting a candidate. Use activity patterns only to choose an exploratory pilot; collect more comparable outcomes.\n";
  md +=
    "\n### Descriptive window performance\n\nSuccess uses each selected local month’s own community-relative score threshold. It is a separate descriptive measure from the frozen-threshold later-half check above.\n\n| IST submission window | Eligible posts | Median score | Median comments | Success rate | 95% Wilson interval |\n|---|---:|---:|---:|---:|---|\n";
  for (const x of f.windows)
    md += `| ${window(x)} | ${x.n} | ${fmt(x.score)} | ${fmt(x.medianComments)} | ${pct(x.rate)} | ${x.ci?.map(pct).join("–") || "Unavailable"} |\n`;
  md +=
    "\nMonthly thresholds: " +
    Object.entries(f.thresholds)
      .map(([m, t]) => `${m}: score ≥ ${t.score} (n=${t.n})`)
      .join("; ") +
    ". Ties can produce more than 25% successes.\n";
  md +=
    "\n### Stability and capture context\n\n| Week beginning | Observed days | Comments/day | Posts/day | Median score | Eligible posts |\n|---|---:|---:|---:|---:|---:|\n";
  for (const x of f.weeks)
    md += `| ${x.week} | ${x.days}${x.days < 7 ? " (partial)" : ""} | ${fmt(x.commentsPerDay)} | ${fmt(x.postsPerDay)} | ${fmt(x.score)} | ${x.n} |\n`;
  md += `\nThe top 1% of eligible posts accounted for ${pct(f.topScoreShare)} of positive score mass; medians reduce that influence. The whole acquisition included ${fmt(f.audit.removedPosts)} removed/deleted posts and ${fmt(f.audit.knownBotRecords)} known-bot records. The median second-snapshot age was ${f.audit.snapshotAgeMedian.toFixed(3)} hours. These exclusions and the small number of weeks limit generalization. Monthly and flair comparisons are available in the website.\n`;
}
md +=
  "\n## What remains unavailable\n\n- Historical online-user counts, silent readership, weekly visitors, and private post-insight views.\n- First-24-hour performance or exact lifetime upvote counts.\n- A guarantee of archive capture completeness, definitive bot labels, or full moderation history.\n- Causal effects of posting time, topic-matched experiments, and long-term seasonal validation.\n\nRead the [full methodology](methodology.md) for the temporal split, thresholds, uncertainty, and confounders. Personal post-insight views remain unverified and are not used as evidence.\n\n## Measured résumé wording\n\n> Built a Reddit analytics platform over " +
  fmt(total) +
  " archived records across three communities, with a reproducible SQLite ingestion pipeline, eight-timezone activity heatmaps, snapshot-age validation, and temporal holdout analysis with weekly bootstrap uncertainty.\n\nDo not claim that the project increased engagement or discovered a causal best time. No prospective posting experiment has been completed.\n";
fs.writeFileSync(path.join(root, "docs/initial-report.md"), md);
fs.writeFileSync(
  path.join(root, "docs/findings.json"),
  JSON.stringify(
    {
      generatedAt: manifest.generatedAt,
      options,
      totalRecords: total,
      communities: findings,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      totalRecords: total,
      communities: findings.map((f) => ({
        name: f.subreddit,
        totals: f.totals,
        busiest: window(f.commentWindow),
        candidate: f.recommendation ? window(f.recommendation) : null,
        laterRate: f.recommendation?.test.rate,
        baseline: f.recommendation?.baseline.rate,
        deltaCI: f.recommendation?.deltaCI,
      })),
    },
    null,
    2,
  ),
);
