import { localParts, median } from "./analysis.js";
import { availableZones } from "./timezone.js";

export const API = "https://arctic-shift.photon-reddit.com/api";
export const BOTS = [
  "automoderator",
  "bot-sleuth-bot",
  "remindmebot",
  "haikusbot",
  "sneakpeekbot",
  "savevideo",
  "repostsleuthbot",
];
export const LIMITS = {
  days: 93,
  records: 200000,
  requests: 350,
  interval: 1000,
};
const unknown = new Set(["", "[deleted]", "[removed]"]);
const numeric = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted)
      return reject(new DOMException("Cancelled", "AbortError"));
    const timer = setTimeout(done, ms);
    function abort() {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    }
    function done() {
      signal?.removeEventListener("abort", abort);
      resolve();
    }
    signal?.addEventListener("abort", abort, { once: true });
  });

export function subredditName(value) {
  const name = String(value || "")
    .trim()
    .replace(/^\/?r\//i, "");
  if (!/^[A-Za-z0-9_]{2,21}$/.test(name))
    throw new Error("Enter a subreddit name, such as LocalLLaMA or r/ollama.");
  return name;
}
export function addDays(date, count) {
  const t = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== date)
    throw new Error("Choose real calendar dates.");
  return new Date(t + count * 86400000).toISOString().slice(0, 10);
}
export function dayStart(date, zone) {
  addDays(date, 0);
  const center = Date.parse(date + "T00:00:00Z") / 1000;
  let low = center - 18 * 3600,
    high = center + 18 * 3600;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (localParts(mid, zone).date < date) low = mid + 1;
    else high = mid;
  }
  return low;
}
export function normalize(record, kind, subreddit) {
  if (
    !record.id ||
    typeof record.subreddit !== "string" ||
    record.subreddit.toLowerCase() !== subreddit.toLowerCase() ||
    numeric(record.created_utc) === null
  )
    throw new Error("The source returned an invalid record identity.");
  const author = String(record.author || "").toLowerCase();
  const meta = record._meta || {};
  const edited = String(meta.edited_title || "").toLowerCase();
  const removed = Boolean(
    meta.was_deleted_later ||
      ["[removed]", "[deleted]"].includes(record.selftext) ||
      edited.startsWith("[ removed") ||
      ["[removed]", "[deleted]"].includes(edited) ||
      (record.removed_by_category && !meta.was_initially_deleted),
  );
  const t = Math.floor(record.created_utc),
    snapshot = numeric(meta.retrieved_2nd_on);
  const age = snapshot === null ? null : (snapshot - t) / 3600;
  const bot = BOTS.includes(author);
  const excluded = bot
    ? "Known bot"
    : removed
      ? "Removed/deleted"
      : record.stickied
        ? "Pinned"
        : age === null
          ? "Snapshot age unavailable"
          : age < 35 || age > 40
            ? "Snapshot outside 35–40h"
            : numeric(record.score) === null ||
                numeric(record.num_comments) === null
              ? "Missing outcome"
              : null;
  return {
    kind,
    id: String(record.id).replace(/^t[13]_/, ""),
    t,
    author: unknown.has(author) ? null : author,
    bot,
    removed,
    observed: snapshot ?? numeric(record.retrieved_on) ?? 0,
    post:
      kind === "posts"
        ? {
            id: String(record.id).replace(/^t3_/, ""),
            t,
            title: removed
              ? "[Title unavailable: removed/deleted]"
              : String(record.title || "[Title unavailable]"),
            score: numeric(record.score),
            comments: numeric(record.num_comments),
            flair: record.link_flair_text || null,
            age,
            snapshotAt: snapshot,
            excluded,
            bot,
          }
        : null,
  };
}
export function aggregateDay(rows, { start, end, zone, fetchedAt, ledger, parts = localParts }) {
  const cells = new Map(),
    authors = new Set();
  for (let t = start; t < end; t += 1800) {
    const p = parts(t, zone);
    if (!cells.has(p.hour))
      cells.set(p.hour, [p.date, p.hour, p.day, 0, 0, new Set(), 0]);
    cells.get(p.hour)[6] += Math.min(1800, end - t) / 3600;
  }
  for (const r of rows) {
    if (r.bot || r.t < start || r.t >= end) continue;
    const p = parts(r.t, zone),
      cell = cells.get(p.hour);
    cell[r.kind === "posts" ? 3 : 4]++;
    if (r.author) {
      cell[5].add(r.author);
      authors.add(r.author);
    }
  }
  const posts = rows.filter((r) => r.kind === "posts").map((r) => r.post);
  const date = parts(start, zone).date;
  return {
    schema: 1,
    start,
    end,
    zone,
    fetchedAt,
    ledger,
    posts,
    hours: [...cells.values()].map((c) => [
      c[0],
      c[1],
      c[2],
      c[3],
      c[4],
      c[5].size,
      c[6],
    ]),
    dailyAuthors: { [date]: authors.size },
    audit: {
      records: rows.length,
      posts: posts.length,
      comments: rows.length - posts.length,
      knownBotRecords: rows.filter((r) => r.bot).length,
      unattributedRecords: rows.filter((r) => !r.author).length,
      removedPosts: rows.filter((r) => r.kind === "posts" && r.removed).length,
      eligiblePosts: posts.filter((p) => !p.excluded).length,
    },
    firstRecord: rows.length
      ? rows.reduce((m, r) => Math.min(m, r.t), Infinity)
      : null,
    lastRecord: rows.length
      ? rows.reduce((m, r) => Math.max(m, r.t), -Infinity)
      : null,
  };
}
export function combineDays(chunks, subreddit, zone) {
  if (!chunks.length)
    throw new Error(
      "Select at least one completed local day. Recent observations are shown separately.",
    );
  chunks.sort((a, b) => a.start - b.start);
  for (let i = 1; i < chunks.length; i++)
    if (chunks[i].start !== chunks[i - 1].end)
      throw new Error(
        "A day is missing. Incomplete coverage cannot be analyzed.",
      );
  const posts = chunks.flatMap((c) => c.posts),
    audit = {};
  for (const key of Object.keys(chunks[0].audit))
    audit[key] = chunks.reduce((sum, c) => sum + c.audit[key], 0);
  const ages = posts.map((p) => p.age).filter((a) => a !== null);
  Object.assign(audit, {
    snapshotAgeMedian: median(ages),
    snapshotAgeMin: ages.length
      ? ages.reduce((m, x) => Math.min(m, x), Infinity)
      : null,
    snapshotAgeMax: ages.length
      ? ages.reduce((m, x) => Math.max(m, x), -Infinity)
      : null,
  });
  const times = chunks.flatMap((c) => [c.fetchedAt, c.fetchedAtMax || c.fetchedAt]).sort();
  return {
    subreddit,
    mode: "on-demand",
    coverage: {
      start: chunks[0].start,
      end: chunks.at(-1).end,
      acquisitionComplete: true,
      firstRecord:
        chunks.find((c) => c.firstRecord !== null)?.firstRecord ?? null,
      lastRecord:
        [...chunks].reverse().find((c) => c.lastRecord !== null)?.lastRecord ??
        null,
      fetchedAtMin: times[0],
      fetchedAtMax: times.at(-1),
      completeness:
        "Every page exhausted for each selected day. Archive capture completeness is unknown.",
    },
    audit,
    posts,
    zones: {
      [zone]: {
        hours: chunks.flatMap((c) => c.hours),
        dailyAuthors: Object.assign({}, ...chunks.map((c) => c.dailyAuthors)),
      },
    },
    ledger: [...new Map(chunks.flatMap((c) => c.ledger).map((entry) => [JSON.stringify(entry), entry])).values()],
    freshness: chunks.map((c) => ({
      date: localParts(c.start, zone).date,
      fetchedAt: c.fetchedAt,
    })),
  };
}

export class ArcticClient {
  constructor({
    fetcher = fetch,
    interval = LIMITS.interval,
    wait = sleep,
    now = () => Date.now(),
    relay = null,
    timeoutMs = 25000,
  } = {}) {
    // Web IDL fetch requires the Window/WorkerGlobalScope receiver. Calling a
    // stored native function as this.fetcher() otherwise throws before any I/O.
    this.fetcher = (...args) => Reflect.apply(fetcher, globalThis, args);
    this.interval = interval;
    this.wait = wait;
    this.now = now;
    this.relay = relay;
    this.useRelay = false;
    this.timeoutMs = timeoutMs;
    this.tail = Promise.resolve();
    this.last = 0;
  }
  async request(
    path,
    params,
    { signal, budget, ledger, progress = () => {} } = {},
  ) {
    const run = async () => {
      const url = new URL(API + path);
      for (const [k, v] of Object.entries(params))
        url.searchParams.set(k, String(v));
      for (let attempt = 0; attempt < 3; attempt++) {
        if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
        if (budget && ++budget.requests > LIMITS.requests)
          throw new Error(
            "This interval needs too many source requests. Try 7 days or 1 day; no partial findings were published.",
          );
        await this.wait(
          Math.max(0, this.last + this.interval - this.now()),
          signal,
        );
        this.last = this.now();
        const timeout = new AbortController();
        const abort = () => timeout.abort();
        signal?.addEventListener("abort", abort, { once: true });
        const timer = setTimeout(() => timeout.abort(), this.timeoutMs);
        let res, body;
        let networkError;
        const transport = this.useRelay ? "relay" : "direct";
        const requestUrl = this.useRelay
          ? this.relay + path + url.search
          : url.href;
        progress({ phase: "request", transport, attempt: attempt + 1 });
        try {
          res = await this.fetcher(requestUrl, {
            credentials: this.useRelay ? "same-origin" : "omit",
            cache: "no-store",
            signal: timeout.signal,
          });
          body = await res.text();
        } catch (e) {
          if (signal?.aborted)
            throw new DOMException("Cancelled", "AbortError");
          if (/illegal invocation|incompatible receiver/i.test(e.message))
            throw new Error(
              "The browser request could not start. Reload the page to update the application.",
              { cause: e },
            );
          networkError = timeout.signal.aborted ? "timeout" : "connection";
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
        }
        if (networkError) {
          if (attempt < 2) {
            if (this.relay && !this.useRelay) {
              this.useRelay = true;
              progress({ phase: "retry", reason: "relay", seconds: 1 });
              await this.wait(1000, signal);
            } else {
              const seconds = 3 * 2 ** attempt;
              progress({ phase: "retry", reason: networkError, seconds });
              await this.wait(seconds * 1000, signal);
            }
            continue;
          }
          throw new Error(
            networkError === "timeout"
              ? "The archive took too long to respond after three attempts. Retry with fewer days; completed days are saved."
              : "The archive connection failed after three attempts. Check your connection or retry later. Completed days are saved.",
          );
        }
        if (res.status === 429 || res.status >= 500 || res.status === 422) {
          if (attempt < 2) {
            const delay = Math.min(
              60000,
              Math.max(
                3000,
                Number(res.headers.get("x-ratelimit-reset") || 0) * 1000,
                3000 * 2 ** attempt,
              ),
            );
            progress({
              phase: "retry",
              reason: res.status === 429 ? "rate-limit" : "source",
              seconds: Math.ceil(delay / 1000),
            });
            await this.wait(delay, signal);
            continue;
          }
        }
        if (!res.ok)
          throw new Error(
            `Arctic Shift returned HTTP ${res.status}. Try a shorter interval or retry later.`,
          );
        if (body.length > 15000000)
          throw new Error(
            "A source response exceeded the browser safety limit.",
          );
        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          throw new Error(
            "The archive returned a page instead of records. It may be temporarily unavailable; retry later.",
          );
        }
        if (!Array.isArray(payload.data))
          throw new Error("The source returned an unexpected response.");
        if (ledger) {
          const hash = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(body),
          );
          ledger.push({
            url: url.href,
            transport,
            fetchedAt: new Date(this.now()).toISOString(),
            records: payload.data.length,
            sha256: [...new Uint8Array(hash)]
              .map((x) => x.toString(16).padStart(2, "0"))
              .join(""),
          });
        }
        return payload.data;
      }
    };
    const pending = this.tail.then(run, run);
    this.tail = pending.catch(() => {});
    return pending;
  }
  async discover(prefix, signal) {
    const query = subredditName(prefix);
    const rows = await this.request(
      "/subreddits/search",
      { subreddit_prefix: query, limit: 8, fields: "display_name" },
      { signal },
    );
    return rows.map((r) => r.display_name).filter((n) => typeof n === "string");
  }
  async records(
    kind,
    subreddit,
    start,
    end,
    { signal, budget, ledger, progress = () => {} },
  ) {
    const unique = new Map();
    let cursor = start - 1;
    while (true) {
      const params = {
        subreddit,
        after: cursor,
        before: end,
        sort: "asc",
        limit: "auto",
      };
      if (kind === "comments")
        params.fields = "id,subreddit,created_utc,author,retrieved_on";
      const raw = await this.request(`/${kind}/search`, params, {
        signal,
        budget,
        ledger,
        progress: (event) => progress({ kind, ...event }),
      });
      if (!raw.length) break;
      let newest = -Infinity;
      for (const r of raw) {
        const n = normalize(r, kind, subreddit);
        newest = Math.max(newest, n.t);
        if (n.t < start || n.t >= end) continue;
        const old = unique.get(n.id);
        if (!old && ++budget.records > LIMITS.records)
          throw new Error(
            "This interval exceeds 200,000 records. Choose a shorter range. The app does not sample or report incomplete results.",
          );
        if (!old || n.observed >= old.observed) unique.set(n.id, n);
      }
      progress({ kind, records: budget.records, requests: budget.requests });
      if (raw.length < 100) break;
      if (newest - 1 <= cursor)
        throw new Error(
          "Too many records share one timestamp. Use the offline pipeline or a downloadable archive; this interval cannot be completed safely.",
        );
      cursor = newest - 1;
    }
    return [...unique.values()];
  }
  async pulse(subreddit, signal) {
    const checkedAt = new Date(this.now()).toISOString();
    const results = {};
    for (const kind of ["posts", "comments"]) {
      const rows = await this.request(
        `/${kind}/search`,
        {
          subreddit,
          sort: "desc",
          limit: 1,
          fields: "id,subreddit,created_utc,retrieved_on",
        },
        { signal },
      );
      results[kind] = rows[0]
        ? {
            createdAt: rows[0].created_utc,
            archivedAt: rows[0].retrieved_on ?? null,
          }
        : null;
    }
    return { checkedAt, ...results };
  }
}

export async function loadArchive({
  subreddit,
  start,
  end,
  zone,
  signal,
  force = false,
  progress = () => {},
  client = new ArcticClient(),
  cache,
}) {
  subreddit = subredditName(subreddit);
  addDays(start, 0);
  addDays(end, 0);
  if (
    start > end ||
    Date.parse(end) - Date.parse(start) >= LIMITS.days * 86400000
  )
    throw new Error("Choose an ordered interval of at most 93 days.");
  const today = localParts(client.now() / 1000, zone).date;
  end = end < today ? end : addDays(today, -1);
  const dates = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  if (!dates.length)
    throw new Error(
      "Today is still incomplete. Choose a completed day; the archive freshness panel shows recent observations.",
    );
  const budget = { records: 0, requests: 0 }, chunks = [];
  // Raw identities live only in this acquisition's rolling UTC-day buffer.
  const utcDays = new Map();
  const zones = [...new Set([...availableZones(), zone])];
  const utcToday = Math.floor(client.now() / 86400000) * 86400;
  for (const [i, date] of dates.entries()) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const a = dayStart(date, zone), b = dayStart(addDays(date, 1), zone);
    const tileStart = Math.floor(a / 86400) * 86400;
    const key = `2|${subreddit.toLowerCase()}|${tileStart}`;
    const layout = dayLayout(date, zone);
    let tile = force ? null : await cache?.get(key);
    let chunk = tile?.variants?.[layout.key];
    // Old same-zone summaries remain useful until an explicit refresh upgrades them.
    if (!chunk && !force) chunk = await cache?.get(`1|${subreddit.toLowerCase()}|${zone}|${date}`);
    if (!chunk) {
      const p = (event = {}) => progress({ date, done: i, total: dates.length, ...budget, cached: false, ...event });
      p({ phase: "prepare" });
      // One adjacent UTC day covers most timezone boundaries. Never prefetch an
      // unfinished UTC day unless the requested completed local day needs it.
      const tileEnd = Math.max(b, Math.min(tileStart + 2 * 86400, utcToday));
      const rows = [], ledger = [], collected = [];
      for (let t = tileStart; t < tileEnd; t += 86400) {
        const finish = Math.min(t + 86400, tileEnd);
        let source = utcDays.get(t);
        if (!source || source.end < finish) {
          const sourceLedger = [];
          const from = source?.end || t;
          const options = { signal, budget, ledger: sourceLedger, progress: p };
          const posts = await client.records("posts", subreddit, from, finish, options);
          const comments = await client.records("comments", subreddit, from, finish, options);
          source = {
            end: finish, rows: [...(source?.rows || []), ...posts, ...comments],
            ledger: [...(source?.ledger || []), ...sourceLedger],
            fetchedAt: source?.fetchedAt || new Date(client.now()).toISOString(),
            fetchedAtMax: new Date(client.now()).toISOString(),
          };
          utcDays.set(t, source);
        }
        for (const row of source.rows) if (row.t < finish) rows.push(row);
        ledger.push(...source.ledger);
        collected.push(source.fetchedAt, source.fetchedAtMax);
      }
      p({ phase: "aggregate" });
      tile = buildTimezoneTile(rows, {
        start: tileStart, end: tileEnd, zones,
        fetchedAt: collected.sort()[0], fetchedAtMax: collected.at(-1), ledger, signal,
      });
      chunk = tile.variants[layout.key];
      if (!chunk) throw new Error("The requested local day could not be summarized completely.");
      await cache?.set(key, tile);
      // Discard author names as soon as their UTC day leaves the rolling window.
      for (const t of utcDays.keys()) if (t < tileStart) utcDays.delete(t);
    }
    if (!chunk.posts) chunk = { ...chunk, zone, ledger: tile.ledger, posts: tile.posts.filter((post) => post.t >= a && post.t < b) };
    chunks.push(chunk);
    if (chunks.reduce((sum, c) => sum + c.audit.records, 0) > LIMITS.records)
      throw new Error("The selected days exceed the 200,000-record browser limit. Choose a shorter range; completed days remain cached.");
    progress({ date, done: i + 1, total: dates.length, ...budget, cached: true });
  }
  return { ...combineDays(chunks, subreddit, zone), acquisitionRequests: budget.requests };
}

// Equal UTC boundaries and local-hour layouts share an anonymous summary,
// even when multiple IANA names describe that layout. No author hashes persist.
export function dayLayout(date, zone) {
  const start = dayStart(date, zone), end = dayStart(addDays(date, 1), zone);
  const buckets = [];
  for (let t = start; t < end; t += 900) buckets.push(localParts(t, zone));
  return {
    start, end, buckets,
    key: `${date}|${start}|${end}|${buckets.map((p) => p.hour).join(",")}`,
  };
}
export function buildTimezoneTile(rows, { start, end, zones, fetchedAt, fetchedAtMax = fetchedAt, ledger, signal }) {
  const variants = {};
  for (const zone of zones) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    let date = localParts(start, zone).date;
    if (dayStart(date, zone) < start) date = addDays(date, 1);
    const layout = dayLayout(date, zone);
    if (layout.start < start || layout.start >= start + 86400 || layout.end > end || layout.end <= layout.start || variants[layout.key]) continue;
    const selected = rows.filter((r) => r.t >= layout.start && r.t < layout.end);
    const chunk = aggregateDay(selected, {
      start: layout.start, end: layout.end, zone, fetchedAt, ledger: [],
      parts: (t) => layout.buckets[Math.floor((t - layout.start) / 900)],
    });
    // Post evidence and provenance are shared by all variants of this tile.
    chunk.fetchedAtMax = fetchedAtMax;
    delete chunk.posts;
    delete chunk.ledger;
    variants[layout.key] = chunk;
  }
  return { schema: 2, start, end, variants, ledger, posts: rows.filter((r) => r.kind === "posts").map((r) => r.post) };
}
