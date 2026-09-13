import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  quantile,
  median,
  wilson,
  localParts,
  weekKey,
  blockDifference,
  analyze,
} from "../dist/analysis.js";
const epoch = (s) => Date.parse(s) / 1000;
test("linear quantiles and medians resist a single large outlier", () => {
  assert.equal(median([1, 2, 3, 100000]), 2.5);
  assert.equal(quantile([1, 2, 3, 4], 0.75), 3.25);
  assert.equal(median([]), null);
});
test("Wilson matches an independently tabulated 50/100 interval", () => {
  const [lo, hi] = wilson(50, 100);
  assert.ok(Math.abs(lo - 0.40383153) < 1e-7);
  assert.ok(Math.abs(hi - 0.59616847) < 1e-7);
  assert.equal(wilson(0, 0), null);
  assert.ok(wilson(0, 10)[1] > 0.27);
  assert.ok(wilson(10, 10)[0] < 0.73);
});
test("IST crosses midnight at 18:30 UTC and moves weekday", () => {
  assert.deepEqual(localParts(epoch("2026-08-02T18:29:59Z"), "Asia/Kolkata"), {
    date: "2026-08-02",
    hour: 23,
    minute: 59,
    day: 6,
  });
  assert.deepEqual(localParts(epoch("2026-08-02T18:30:00Z"), "Asia/Kolkata"), {
    date: "2026-08-03",
    hour: 0,
    minute: 0,
    day: 0,
  });
});
test("New York DST spring gap and fall repeated hour use actual IANA rules", () => {
  assert.equal(
    localParts(epoch("2026-03-08T06:59:00Z"), "America/New_York").hour,
    1,
  );
  assert.equal(
    localParts(epoch("2026-03-08T07:00:00Z"), "America/New_York").hour,
    3,
  );
  assert.equal(
    localParts(epoch("2026-11-01T05:30:00Z"), "America/New_York").hour,
    1,
  );
  assert.equal(
    localParts(epoch("2026-11-01T06:30:00Z"), "America/New_York").hour,
    1,
  );
});
test("weeks begin Monday across year boundaries", () => {
  assert.equal(weekKey("2026-01-01"), "2025-12-29");
  assert.equal(weekKey("2026-08-03"), "2026-08-03");
});
test("weekly cluster resampling is deterministic and respects equal outcomes", () => {
  const posts = Array.from({ length: 60 }, (_, i) => ({
    week: ["a", "b", "c"][i % 3],
    window: i % 2,
    success: i % 4 < 2,
  }));
  assert.deepEqual(blockDifference(posts, 0), blockDifference(posts, 0));
  assert.deepEqual(blockDifference(posts, 0), [0, 0]);
  assert.equal(
    blockDifference(
      posts.filter((p) => p.week !== "c"),
      0,
    ),
    null,
  );
});
function fixture() {
  return {
    coverage: {
      start: epoch("2026-07-27T00:00:00Z"),
      end: epoch("2026-09-07T00:00:00Z"),
    },
    posts: [],
    zones: {
      "Asia/Kolkata": {
        hours: [
          ["2026-07-27", 5, 0, 1, 7, 2, 0.5],
          ["2026-07-28", 0, 1, 3, 10, 2, 1],
          ["2026-07-28", 1, 1, 1, 20, 2, 1],
        ],
        dailyAuthors: { "2026-07-27": 2, "2026-07-28": 3 },
      },
    },
  };
}
test("activity totals never get overwritten by median post comment count", () => {
  const d = fixture();
  d.posts = [
    {
      id: "a",
      t: epoch("2026-07-27T19:00:00Z"),
      score: 5,
      comments: 2,
      excluded: null,
    },
  ];
  const r = analyze(d, { start: "2026-07-28", end: "2026-07-28" });
  assert.equal(r.totals.comments, 30);
  assert.equal(r.totals.medianComments, 2);
  assert.equal(r.totals.posts, 4);
  assert.equal(r.totals.medianDailyAuthors, 3);
  assert.equal(r.recommendation, null);
});
test("partial boundary days are excluded instead of being called quiet", () => {
  const r = analyze(fixture(), { start: "2026-07-27", end: "2026-07-28" });
  assert.equal(r.clippedDays, 1);
  assert.equal(r.start, "2026-07-28");
  assert.equal(r.totals.comments, 30);
});
test("empty coverage, invalid date and unknown timezone fail explicitly", () => {
  assert.equal(
    analyze(fixture(), { start: "2026-09-10", end: "2026-09-11" }).empty,
    true,
  );
  assert.throws(
    () => analyze(fixture(), { start: "2026-02-31", end: "2026-03-03" }),
    /calendar/,
  );
  assert.throws(
    () => analyze(fixture(), { start: "2026-08-10", end: "2026-08-01" }),
    /valid/,
  );
  assert.throws(() =>
    analyze(fixture(), {
      start: "2026-08-01",
      end: "2026-08-02",
      zone: "invalid",
    }),
  );
});
test("excluded posts cannot change outcome thresholds", () => {
  const d = fixture();
  d.posts = [
    {
      id: "a",
      t: epoch("2026-07-27T19:00:00Z"),
      score: 2,
      comments: 1,
      excluded: null,
    },
    {
      id: "b",
      t: epoch("2026-07-27T19:30:00Z"),
      score: 1e9,
      comments: 1000,
      excluded: "Pinned",
    },
  ];
  const r = analyze(d, { start: "2026-07-28", end: "2026-07-28" });
  assert.equal(r.posts.length, 2);
  assert.equal(r.eligible.length, 1);
  assert.equal(r.thresholds["2026-07"].score, 2);
});
test(
  "real exported datasets reconcile across heatmaps, days, windows and posts",
  {
    skip: fs.existsSync(new URL("../dist/data/manifest.json", import.meta.url))
      ? false
      : "Acquire and export a dataset to run this integration check",
  },
  () => {
    const manifest = JSON.parse(
      fs.readFileSync(new URL("../dist/data/manifest.json", import.meta.url)),
    );
    for (const c of manifest.communities) {
      const d = JSON.parse(
        fs.readFileSync(new URL("../dist/data/" + c.file, import.meta.url)),
      );
      for (const zone of manifest.zones) {
        const r = analyze(d, {
          start: manifest.defaultStart,
          end: manifest.defaultEnd,
          zone,
        });
        assert.equal(r.empty, false);
        assert.equal(r.totals.posts, r.posts.filter((p) => !p.bot).length);
        assert.equal(
          r.totals.comments,
          r.heat.reduce((s, h) => s + h.comments, 0),
        );
        assert.equal(
          r.totals.comments,
          r.daily.reduce((s, h) => s + h.comments, 0),
        );
        assert.equal(
          r.windows.reduce((s, w) => s + w.n, 0),
          r.eligible.length,
        );
        assert.ok(r.days > 0);
        assert.ok(r.eligible.every((p) => p.age >= 35 && p.age <= 40));
        assert.ok(r.heat.every((h) => h.occurrences <= Math.ceil(r.days / 7)));
      }
    }
  },
);
test("later-half scores cannot alter first-half selection threshold", () => {
  const d = fixture();
  const zoneData = d.zones["Asia/Kolkata"];
  zoneData.hours = [];
  zoneData.dailyAuthors = {};
  // Synthetic, balanced observations across 40 days and six windows.
  // The earlier half favors window 0; the later mutation must not change that.
  for (let day = 0; day < 40; day++) {
    const t = epoch("2026-07-28T00:00:00+05:30") + day * 86400;
    const local = localParts(t, "Asia/Kolkata");
    zoneData.dailyAuthors[local.date] = 12;
    for (let hour = 0; hour < 24; hour++) {
      zoneData.hours.push([
        local.date,
        hour,
        local.day,
        hour % 4 === 0 ? 2 : 0,
        3,
        2,
        1,
      ]);
    }
    for (let window = 0; window < 6; window++) {
      for (let repeat = 0; repeat < 2; repeat++) {
        d.posts.push({
          id: `synthetic-${day}-${window}-${repeat}`,
          t: t + window * 14400 + repeat * 60,
          score: window === 0 ? 10 + (day % 2) : day % 5,
          comments: 2,
          excluded: null,
        });
      }
    }
  }
  const options = {
      start: "2026-07-28",
      end: "2026-09-05",
      zone: "Asia/Kolkata",
    },
    a = analyze(d, options);
  assert.ok(a.recommendation);
  assert.equal(a.recommendation.i, 0);
  const changed = structuredClone(d);
  for (const p of changed.posts)
    if (localParts(p.t, options.zone).date >= a.midpoint) p.score += 10000;
  const b = analyze(changed, options);
  assert.equal(a.discoveryThreshold, b.discoveryThreshold);
  assert.equal(a.recommendation.i, b.recommendation.i);
  assert.equal(a.recommendation.train.rate, b.recommendation.train.rate);
});
