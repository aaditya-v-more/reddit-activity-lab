export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const ZONES = [
  "Asia/Kolkata",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
];
export function quantile(values, q) {
  if (!values.length) return null;
  const a = [...values].sort((a, b) => a - b),
    x = (a.length - 1) * q,
    i = Math.floor(x);
  return a[i] + (a[Math.min(i + 1, a.length - 1)] - a[i]) * (x - i);
}
export const median = (a) => quantile(a, 0.5);
export const sum = (a) => a.reduce((s, x) => s + x, 0);
export function wilson(k, n, z = 1.95996398454) {
  if (!n) return null;
  const p = k / n,
    d = 1 + (z * z) / n,
    c = (p + (z * z) / (2 * n)) / d,
    h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const formatters = new Map();
export function localParts(t, zone) {
  if (!ZONES.includes(zone)) throw new Error("Unsupported timezone");
  if (!formatters.has(zone))
    formatters.set(
      zone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        weekday: "short",
      }),
    );
  const p = Object.fromEntries(
    formatters
      .get(zone)
      .formatToParts(t * 1000)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
    day: DAYS.indexOf(p.weekday),
  };
}
export function weekKey(date) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function dateRange(start, end) {
  const dates = [];
  for (
    let t = Date.parse(start + "T00:00:00Z");
    t <= Date.parse(end + "T00:00:00Z");
    t += 86400000
  )
    dates.push(new Date(t).toISOString().slice(0, 10));
  return dates;
}
function stat(posts) {
  const n = posts.length,
    k = posts.filter((p) => p.success).length;
  return {
    n,
    k,
    rate: n ? k / n : null,
    ci: wilson(k, n),
    score: median(posts.map((p) => p.score)),
    medianComments: median(posts.map((p) => p.comments)),
  };
}
export function blockDifference(posts, window, iterations = 1000) {
  const weeks = [...new Set(posts.map((p) => p.week))];
  if (weeks.length < 3) return null;
  const groups = weeks.map((w) => {
    const p = posts.filter((p) => p.week === w);
    return {
      a: stat(p.filter((p) => p.window === window)),
      b: stat(p.filter((p) => p.window !== window)),
    };
  });
  let seed = 1729;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const delta = [];
  for (let i = 0; i < iterations; i++) {
    let ak = 0,
      an = 0,
      bk = 0,
      bn = 0;
    for (let j = 0; j < weeks.length; j++) {
      const g = groups[Math.floor(random() * groups.length)];
      ak += g.a.k;
      an += g.a.n;
      bk += g.b.k;
      bn += g.b.n;
    }
    if (an && bn) delta.push(ak / an - bk / bn);
  }
  return delta.length ? [quantile(delta, 0.025), quantile(delta, 0.975)] : null;
}
export function analyze(data, { start, end, zone = "Asia/Kolkata" }) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    start > end
  )
    throw new Error("Choose a valid start and end date.");
  if (
    [start, end].some(
      (d) =>
        !Number.isFinite(Date.parse(d + "T00:00:00Z")) ||
        new Date(d + "T00:00:00Z").toISOString().slice(0, 10) !== d,
    )
  )
    throw new Error("Choose real calendar dates.");
  if (!data.zones[zone])
    throw new Error(
      "This archive has not been exported for the selected timezone.",
    );
  const dates = dateRange(start, end);
  if (dates.length > 93) throw new Error("Choose a range of at most 93 days.");
  const coverage = data.coverage;
  // A local day is eligible only when both of its edges are inside acquisition.
  const lower = localParts(coverage.start, zone),
    upper = localParts(coverage.end, zone);
  const safeDates = dates.filter(
    (d) =>
      (d > lower.date ||
        (d === lower.date &&
          lower.hour === 0 &&
          lower.minute === 0 &&
          coverage.start % 60 === 0)) &&
      d < upper.date,
  );
  const safe = new Set(safeDates);
  const hours = data.zones[zone].hours.filter((h) => safe.has(h[0]));
  if (!hours.length)
    return { empty: true, requestedDays: dates.length, days: 0 };
  const heat = Array.from({ length: 168 }, (_, i) => ({
    day: Math.floor(i / 24),
    hour: i % 24,
    posts: 0,
    comments: 0,
    authors: 0,
    exposure: 0,
    occurrences: 0,
  }));
  const byDate = Object.fromEntries(
    safeDates.map((d) => [
      d,
      {
        date: d,
        posts: 0,
        comments: 0,
        authors: data.zones[zone].dailyAuthors[d] || 0,
      },
    ]),
  );
  for (const h of hours) {
    const c = heat[h[2] * 24 + h[1]];
    c.posts += h[3];
    c.comments += h[4];
    c.authors += h[5];
    c.exposure += h[6];
    c.occurrences++;
    byDate[h[0]].posts += h[3];
    byDate[h[0]].comments += h[4];
  }
  for (const c of heat) {
    c.meanPosts = c.exposure ? c.posts / c.exposure : 0;
    c.meanComments = c.exposure ? c.comments / c.exposure : 0;
    c.meanAuthors = c.occurrences ? c.authors / c.occurrences : 0;
  }
  const posts = data.posts
    .map((p) => ({ ...p, ...localParts(p.t, zone) }))
    .filter((p) => safe.has(p.date))
    .map((p) => ({
      ...p,
      month: p.date.slice(0, 7),
      week: weekKey(p.date),
      window: Math.floor(p.hour / 4),
    }));
  const eligible = posts.filter((p) => !p.excluded);
  const months = [...new Set(eligible.map((p) => p.month))];
  const thresholds = Object.fromEntries(
    months.map((m) => {
      const sample = eligible.filter((p) => p.month === m);
      return [
        m,
        {
          score: Math.max(
            1,
            Math.ceil(
              quantile(
                sample.map((p) => p.score),
                0.75,
              ),
            ),
          ),
          n: sample.length,
        },
      ];
    }),
  );
  for (const p of eligible) p.success = p.score >= thresholds[p.month].score;
  const midpoint = safeDates[Math.floor(safeDates.length / 2)];
  const discoveryPosts = eligible.filter((p) => p.date < midpoint);
  const discoveryThreshold = discoveryPosts.length
    ? Math.max(
        1,
        Math.ceil(
          quantile(
            discoveryPosts.map((p) => p.score),
            0.75,
          ),
        ),
      )
    : null;
  const experimentPosts = eligible.map((p) => ({
    ...p,
    success: discoveryThreshold !== null && p.score >= discoveryThreshold,
  }));
  const windows = Array.from({ length: 6 }, (_, i) => {
    const sample = eligible.filter((p) => p.window === i),
      activity = hours.filter((h) => Math.floor(h[1] / 4) === i);
    const weeks = [...new Set(sample.map((p) => p.week))];
    const experimentSample = experimentPosts.filter((p) => p.window === i);
    const train = stat(experimentSample.filter((p) => p.date < midpoint)),
      test = stat(experimentSample.filter((p) => p.date >= midpoint));
    return {
      i,
      start: i * 4,
      end: (i + 1) * 4,
      ...stat(sample),
      train,
      test,
      weeks: weeks.length,
      weekly: weeks.map((w) => ({
        week: w,
        ...stat(sample.filter((p) => p.week === w)),
      })),
      postsPerHour:
        sum(activity.map((h) => h[3])) / sum(activity.map((h) => h[6])),
      commentsPerHour:
        sum(activity.map((h) => h[4])) / sum(activity.map((h) => h[6])),
      authorsPerHour: sum(activity.map((h) => h[5])) / activity.length,
    };
  });
  const candidates = windows
    .filter((w) => w.train.n >= 20 && w.test.n >= 20 && w.weeks >= 4)
    .sort((a, b) => b.train.ci[0] - a.train.ci[0] || a.i - b.i);
  const candidate = candidates[0] || null;
  const testPosts = experimentPosts.filter((p) => p.date >= midpoint);
  let recommendation = null;
  if (candidate) {
    const baseline = stat(testPosts.filter((p) => p.window !== candidate.i));
    const ci = blockDifference(testPosts, candidate.i);
    recommendation = {
      ...candidate,
      baseline,
      delta: candidate.test.rate - baseline.rate,
      deltaCI: ci,
      label:
        ci && ci[0] > 0
          ? "Tentative signal"
          : candidate.test.rate > baseline.rate
            ? "Uncertain advantage"
            : "No holdout advantage",
      positiveWeeks: candidate.weekly.filter(
        (w) =>
          w.rate >
          stat(
            eligible.filter(
              (p) => p.week === w.week && p.window !== candidate.i,
            ),
          ).rate,
      ).length,
    };
  }
  const daily = Object.values(byDate);
  const busiest = [...windows].sort(
    (a, b) => b.commentsPerHour - a.commentsPerHour,
  )[0];
  const hourly = Array.from({ length: 24 }, (_, hour) => {
    const a = heat.filter((c) => c.hour === hour);
    const n = sum(a.map((c) => c.exposure));
    return {
      hour,
      comments: sum(a.map((c) => c.comments)) / n,
      posts: sum(a.map((c) => c.posts)) / n,
      authors: sum(a.map((c) => c.authors)) / sum(a.map((c) => c.occurrences)),
    };
  });
  const weeks = [...new Set(daily.map((d) => weekKey(d.date)))].map((w) => {
    const d = daily.filter((d) => weekKey(d.date) === w);
    const ps = eligible.filter((p) => p.week === w);
    return {
      week: w,
      days: d.length,
      commentsPerDay: sum(d.map((x) => x.comments)) / d.length,
      postsPerDay: sum(d.map((x) => x.posts)) / d.length,
      participantsPerDay: sum(d.map((x) => x.authors)) / d.length,
      ...stat(ps),
    };
  });
  const monthly = months.map((m) => {
    const d = daily.filter((d) => d.date.startsWith(m));
    return {
      month: m,
      days: d.length,
      commentsPerDay: sum(d.map((x) => x.comments)) / d.length,
      postsPerDay: sum(d.map((x) => x.posts)) / d.length,
      ...stat(eligible.filter((p) => p.month === m)),
      threshold: thresholds[m].score,
    };
  });
  const topShare = eligible.length
    ? sum(
        [...eligible]
          .sort((a, b) => b.score - a.score)
          .slice(0, Math.max(1, Math.ceil(eligible.length * 0.01)))
          .map((p) => Math.max(0, p.score)),
      ) / Math.max(1, sum(eligible.map((p) => Math.max(0, p.score))))
    : 0;
  return {
    empty: false,
    start: safeDates[0],
    end: safeDates.at(-1),
    days: safeDates.length,
    clippedDays: dates.length - safeDates.length,
    zone,
    heat,
    daily,
    posts,
    eligible,
    thresholds,
    midpoint,
    discoveryThreshold,
    windows,
    recommendation,
    busiest,
    hourly,
    weeks,
    monthly,
    topShare,
    totals: {
      posts: sum(daily.map((d) => d.posts)),
      comments: sum(daily.map((d) => d.comments)),
      medianDailyAuthors: median(daily.map((d) => d.authors)),
      ...stat(eligible),
    },
  };
}
