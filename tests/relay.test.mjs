import test from "node:test";
import assert from "node:assert/strict";
import handler, { sourceUrl } from "../api/archive.js";

test("original and rewritten relay URLs resolve to the same scoped source request", () => {
  const query = "subreddit=ollama&after=100&before=86500";
  for (const kind of ["posts", "comments"])
    assert.equal(
      sourceUrl(`/archive/${kind}/search?${query}`),
      sourceUrl(`/api/archive?kind=${kind}&${query}`),
    );
  assert.equal(
    sourceUrl("/archive/subreddits/search?subreddit_prefix=oll"),
    sourceUrl("/api/archive?kind=subreddits&subreddit_prefix=oll"),
  );
});

test("relay allows only scoped day queries, latest records, and subreddit discovery", () => {
  const url = new URL(
    sourceUrl(
      "/api/archive?kind=comments&subreddit=ollama&after=100&before=86500&url=https://evil.test&fields=body&sort=desc",
    ),
  );
  assert.equal(url.origin, "https://arctic-shift.photon-reddit.com");
  assert.equal(url.searchParams.get("sort"), "asc");
  assert.equal(
    url.searchParams.get("fields"),
    "id,subreddit,created_utc,author,retrieved_on",
  );
  assert.ok(!url.searchParams.has("url"));
  assert.throws(
    () =>
      sourceUrl(
        "/api/archive?kind=posts&subreddit=ollama&after=1&before=9999999",
      ),
    /one complete/,
  );
  assert.throws(
    () => sourceUrl("/api/archive?kind=posts&limit=1"),
    /subreddit/,
  );
  assert.throws(
    () => sourceUrl("/api/archive?kind=users&subreddit=ollama"),
    /Unknown/,
  );
  assert.match(
    sourceUrl("/api/archive?kind=posts&subreddit=ollama&limit=1"),
    /sort=desc/,
  );
});

const result = () => ({
  headers: {},
  setHeader(k, v) {
    this.headers[k] = v;
  },
  status(n) {
    this.code = n;
    return this;
  },
  json(v) {
    this.body = v;
    return this;
  },
  send(v) {
    this.body = v;
    return this;
  },
});
test("relay strips all incoming credentials and never follows upstream redirects", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.deepEqual(options.headers, { Accept: "application/json" });
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    return new Response('{"data":[]}');
  });
  const res = result();
  await handler(
    {
      method: "GET",
      url: "/api/archive?kind=posts&subreddit=ollama&limit=1",
      headers: {
        cookie: "private-session-fixture",
        authorization: "Bearer fixture",
      },
    },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(res.body.toString(), '{"data":[]}');
});
test("relay rejects writes and caps streamed response size before returning it", async (t) => {
  const write = result();
  await handler({ method: "POST" }, write);
  assert.equal(write.code, 405);
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(new Uint8Array(4_000_001)),
  );
  const res = result();
  await handler(
    { method: "GET", url: "/api/archive?kind=posts&subreddit=ollama&limit=1" },
    res,
  );
  assert.equal(res.code, 413);
});
