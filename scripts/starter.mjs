import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ArcticClient,
  dayStart,
  addDays,
  aggregateDay,
  combineDays,
} from "../dist/archive.js";
import { analyze, median, localParts } from "../dist/analysis.js";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const zones = [
  "Asia/Kolkata",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
];
const communities = (process.env.STARTER_COMMUNITIES || "funny,ollama,ClaudeAI,ClaudeCode").split(",");
const end =
  process.env.STARTER_END || addDays(new Date().toISOString().slice(0, 10), -1);
const start = addDays(end, 1 - Number(process.env.STARTER_DAYS || 7));
const lower = Math.min(...zones.map((zone) => dayStart(start, zone)));
const upper = Math.max(...zones.map((zone) => dayStart(addDays(end, 1), zone)));
const client = new ArcticClient();
let entries = [];
try {
  const previous = JSON.parse(await fs.readFile(path.join(root, "dist/starter/manifest.json"), "utf8"));
  entries = previous.entries.filter((entry) => !communities.includes(entry.subreddit));
} catch {}
await fs.mkdir(path.join(root, "data/starter"), { recursive: true });
await fs.mkdir(path.join(root, "dist/starter"), { recursive: true });
for (const subreddit of communities) {
  const cachePath = path.join(
    root,
    "data/starter",
    `${subreddit}-${start}-${end}.json`,
  );
  let saved;
  try {
    if (!process.argv.includes("--refresh"))
      saved = JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch {}
  if (!saved) {
    const ledger = [],
      budget = { requests: 0, records: 0 };
    const options = {
      ledger,
      budget,
      progress: (p) => {
        if (p.records)
          console.log(
            `${subreddit}: ${p.records} records / ${p.requests} requests`,
          );
      },
    };
    const posts = await client.records(
      "posts",
      subreddit,
      lower,
      upper,
      options,
    );
    const comments = await client.records(
      "comments",
      subreddit,
      lower,
      upper,
      options,
    );
    saved = {
      rows: [...posts, ...comments],
      ledger,
      fetchedAt: new Date().toISOString(),
    };
    await fs.writeFile(cachePath, JSON.stringify(saved));
  }
  for (const zone of zones) {
    const chunks = [];
    for (let date = start; date <= end; date = addDays(date, 1)) {
      const a = dayStart(date, zone),
        b = dayStart(addDays(date, 1), zone);
      chunks.push(
        aggregateDay(
          saved.rows.filter((r) => r.t >= a && r.t < b),
          { start: a, end: b, zone, fetchedAt: saved.fetchedAt, ledger: [] },
        ),
      );
    }
    const data = combineDays(chunks, subreddit, zone);
    data.ledger = saved.ledger;
    const result = analyze(data, { start, end, zone });
    result.flairs = Object.entries(
      result.eligible.reduce((groups, p) => {
        (groups[p.flair || "No flair"] ??= []).push(p);
        return groups;
      }, {}),
    )
      .map(([name, ps]) => ({
        name,
        n: ps.length,
        score: median(ps.map((p) => p.score)),
      }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);
    // Published snapshots contain aggregates only. Individual evidence is acquired on demand.
    delete result.posts;
    delete result.eligible;
    const snapshot = {
      schema: 1,
      subreddit,
      zone,
      start,
      end,
      builtAt: saved.fetchedAt,
      coverage: data.coverage,
      audit: data.audit,
      ledger: saved.ledger,
      result,
    };
    const file = `${subreddit}-${zone.replaceAll("/", "_")}.json`;
    await fs.writeFile(
      path.join(root, "dist/starter", file),
      JSON.stringify(snapshot) + "\n",
    );
    entries.push({
      subreddit,
      zone,
      file,
      start,
      end,
      builtAt: saved.fetchedAt,
      records: data.audit.records,
    });
  }
  console.log(
    `${subreddit}: published eight aggregate snapshots for ${start}–${end}`,
  );
}
// Publish the manifest last; a failed acquisition never advertises an incomplete refresh.
await fs.writeFile(
  path.join(root, "dist/starter/manifest.json"),
  JSON.stringify({ schema: 1, entries }) + "\n",
);
