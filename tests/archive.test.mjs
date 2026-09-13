import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  ArcticClient,
  dayStart,
  addDays,
  normalize,
  aggregateDay,
  combineDays,
  loadArchive,
  LIMITS,
} from "../dist/archive.js";
globalThis.crypto ||= webcrypto;
const epoch = (s) => Date.parse(s) / 1000;
const raw = (id, t, extra = {}) => ({
  id,
  subreddit: "Example",
  author: "reader",
  created_utc: t,
  score: 5,
  num_comments: 2,
  title: "Fixture",
  retrieved_on: t + 1,
  _meta: { retrieved_2nd_on: t + 36 * 3600 },
  ...extra,
});
const response = (data, status = 200) =>
  new Response(JSON.stringify({ data }), { status });
test("local-day acquisition boundaries include IST half-hours and DST 23/25-hour days", () => {
  assert.equal(
    dayStart("2026-08-01", "Asia/Kolkata"),
    epoch("2026-07-31T18:30:00Z"),
  );
  for (const [date, hours] of [
    ["2026-03-08", 23],
    ["2026-11-01", 25],
  ]) {
    const start = dayStart(date, "America/New_York"),
      end = dayStart(addDays(date, 1), "America/New_York");
    assert.equal((end - start) / 3600, hours);
    const d = aggregateDay([], {
      start,
      end,
      zone: "America/New_York",
      fetchedAt: "now",
      ledger: [],
    });
    assert.equal(
      d.hours.reduce((s, x) => s + x[6], 0),
      hours,
    );
  }
});
test("participants union posts and comments without retaining any author identifiers", () => {
  const start = dayStart("2026-08-01", "Asia/Kolkata"),
    end = start + 86400;
  const rows = [
    normalize(raw("a", start + 1), "posts", "Example"),
    normalize(raw("b", start + 2), "comments", "Example"),
    normalize(
      raw("c", start + 3, { author: "[deleted]" }),
      "comments",
      "Example",
    ),
    normalize(
      raw("d", start + 4, { author: "AutoModerator" }),
      "comments",
      "Example",
    ),
  ];
  const d = aggregateDay(rows, {
    start,
    end,
    zone: "Asia/Kolkata",
    fetchedAt: "2026-08-02T00:00:00Z",
    ledger: [],
  });
  assert.equal(d.dailyAuthors["2026-08-01"], 1);
  assert.equal(d.hours[0][5], 1);
  assert.equal(d.hours[0][4], 2);
  assert.equal(d.audit.knownBotRecords, 1);
  assert.equal(d.audit.unattributedRecords, 1);
  assert.ok(!JSON.stringify(d).includes('"author"'));
  assert.ok(!JSON.stringify(d).includes("reader"));
});
test("restoration and later removal match offline cohort rules", () => {
  const t = epoch("2026-08-01T00:00:00Z");
  const approved = normalize(
    raw("a", t, {
      removed_by_category: "automod_filtered",
      _meta: { was_initially_deleted: true, retrieved_2nd_on: t + 36 * 3600 },
    }),
    "posts",
    "Example",
  );
  assert.equal(approved.post.excluded, null);
  const removed = normalize(
    raw("b", t, {
      _meta: { was_deleted_later: true, retrieved_2nd_on: t + 36 * 3600 },
    }),
    "posts",
    "Example",
  );
  assert.equal(removed.post.excluded, "Removed/deleted");
  assert.equal(removed.post.title, "[Title unavailable: removed/deleted]");
  assert.equal(
    normalize(raw("c", t, { _meta: {} }), "posts", "Example").post.excluded,
    "Snapshot age unavailable",
  );
});
test("pagination overlaps timestamp ties, deduplicates and keeps the later observation", async () => {
  const t = epoch("2026-08-01T00:00:00Z");
  const page = Array.from({ length: 100 }, (_, i) =>
    raw(String(i), t + Math.floor(i / 2)),
  );
  const urls = [];
  const client = new ArcticClient({
    interval: 0,
    wait: async () => {},
    fetcher: async (url) => {
      urls.push(new URL(url));
      return response(
        urls.length === 1
          ? page
          : [
              {
                ...page[99],
                score: 17,
                _meta: { retrieved_2nd_on: t + 40 * 3600 },
              },
              raw("new", t + 50),
            ],
      );
    },
  });
  const ledger = [],
    budget = { records: 0, requests: 0 };
  const result = await client.records("posts", "Example", t, t + 86400, {
    ledger,
    budget,
  });
  assert.equal(result.length, 101);
  assert.equal(result.find((r) => r.id === "99").post.score, 17);
  assert.equal(Number(urls[1].searchParams.get("after")), t + 48);
  assert.equal(ledger.length, 2);
  assert.match(ledger[0].sha256, /^[a-f0-9]{64}$/);
});
test("saturated same-second pages and record caps fail visibly", async () => {
  const t = epoch("2026-08-01T00:00:00Z");
  const client = new ArcticClient({
    interval: 0,
    wait: async () => {},
    fetcher: async () =>
      response(Array.from({ length: 100 }, (_, i) => raw(String(i), t))),
  });
  await assert.rejects(
    client.records("posts", "Example", t, t + 1, {
      budget: { requests: 0, records: 0 },
    }),
    /share one timestamp/,
  );
  await assert.rejects(
    client.records("posts", "Example", t, t + 1, {
      budget: { requests: 0, records: LIMITS.records },
    }),
    /200,000/,
  );
});
test("failed comments never mark a post-only day complete or write its cache", async () => {
  let writes = 0;
  const client = {
    now: () => Date.parse("2026-08-03T12:00:00Z"),
    records: async (kind) => {
      if (kind === "comments") throw new Error("source failed");
      return [];
    },
  };
  await assert.rejects(
    loadArchive({
      subreddit: "Example",
      start: "2026-08-01",
      end: "2026-08-01",
      zone: "UTC",
      client,
      cache: { get: async () => null, set: async () => writes++ },
    }),
    /source failed/,
  );
  assert.equal(writes, 0);
});
test("recent caches expire independently; older complete days are reused", async () => {
  const now = Date.parse("2026-08-04T12:00:00Z"),
    map = new Map();
  let calls = 0;
  const client = {
    now: () => now,
    records: async () => {
      calls++;
      return [];
    },
  };
  const cache = {
    get: async (key) => map.get(key),
    set: async (k, v) => map.set(k, v),
  };
  const options = {
    subreddit: "Example",
    start: "2026-07-31",
    end: "2026-08-01",
    zone: "UTC",
    client,
    cache,
  };
  await loadArchive(options);
  assert.equal(calls, 4);
  await loadArchive(options);
  assert.equal(calls, 4);
  client.now = () => now + 16 * 60000;
  await loadArchive(options);
  assert.equal(calls, 6);
});
test("combining missing days fails instead of treating the gap as quiet", () => {
  const make = (date) => {
    const start = dayStart(date, "UTC");
    return aggregateDay([], {
      start,
      end: start + 86400,
      zone: "UTC",
      fetchedAt: "2026-08-05T00:00:00Z",
      ledger: [],
    });
  };
  assert.throws(
    () =>
      combineDays([make("2026-08-01"), make("2026-08-03")], "Example", "UTC"),
    /day is missing/,
  );
});
test("source requests omit credentials and respect retry backoff", async () => {
  const waits = [];
  let calls = 0;
  const client = new ArcticClient({
    interval: 0,
    wait: async (ms) => waits.push(ms),
    fetcher: async (url, options) => {
      assert.equal(options.credentials, "omit");
      calls++;
      return response([], calls === 1 ? 429 : 200);
    },
  });
  await client.discover("example");
  assert.equal(calls, 2);
  assert.ok(waits.some((ms) => ms >= 3000));
});
