import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const root = new URL("../dist/starter/", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL("manifest.json", root)));
test("all four starter communities have eight reconciled, anonymous timezone snapshots", () => {
  assert.equal(manifest.entries.length, 32);
  for (const entry of manifest.entries) {
    const data = JSON.parse(fs.readFileSync(new URL(entry.file, root)));
    assert.equal(data.result.zone, entry.zone);
    assert.equal(data.result.days, (Date.parse(entry.end) - Date.parse(entry.start)) / 86400000 + 1);
    assert.equal(
      data.result.daily.reduce((s, d) => s + d.comments, 0),
      data.result.totals.comments,
    );
    assert.equal(
      data.result.heat.reduce((s, d) => s + d.posts, 0),
      data.result.totals.posts,
    );
    assert.equal(
      data.result.windows.reduce((s, w) => s + w.n, 0),
      data.result.totals.n,
    );
    assert.equal(data.audit.posts + data.audit.comments, data.audit.records);
    assert.ok(
      data.ledger.every(
        (r) =>
          /^https:\/\/arctic-shift.photon-reddit.com\/api\//.test(r.url) &&
          /^[0-9a-f]{64}$/.test(r.sha256),
      ),
    );
    const forbidden = new Set([
      "author",
      "title",
      "selftext",
      "body",
      "id",
      "snapshotAt",
      "eligible",
    ]);
    const inspect = (value) => {
      if (!value || typeof value !== "object") return;
      for (const [key, v] of Object.entries(value)) {
        assert.ok(
          !forbidden.has(key),
          `Starter contains individual record field ${key}`,
        );
        inspect(v);
      }
    };
    inspect(data);
    assert.ok(!Array.isArray(data.result.posts));
  }
});
