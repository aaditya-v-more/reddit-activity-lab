import test from "node:test";
import assert from "node:assert/strict";
import { developmentHandler } from "../scripts/dev.mjs";

const response = () => ({
  headers: {},
  statusCode: 200,
  setHeader(k, v) {
    this.headers[k] = v;
  },
  end(body) {
    this.body = body?.toString();
  },
});
test("local preview enables the relay and dispatches the same route contract as production", async () => {
  const calls = [];
  const serve = developmentHandler(async (req, res) => {
    calls.push(req.url);
    res.json({ data: [] });
  });
  const page = response();
  await serve({ method: "GET", url: "/" }, page);
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /data-archive-relay="true"/);
  const route = "/archive/posts/search?subreddit=ollama&limit=1";
  const res = response();
  await serve({ method: "GET", url: route }, res);
  assert.deepEqual(calls, [route]);
  assert.equal(res.body, '{"data":[]}');
  assert.equal(res.headers["Cache-Control"], "no-store");
});
test("local preview does not expose repository files or accept static writes", async () => {
  const serve = developmentHandler();
  for (const url of [
    "/.env",
    "/package.json",
    "/../AGENTS.md",
    "/data/%2e%2e/.env",
    "/api/unknown",
  ]) {
    const res = response();
    await serve({ method: "GET", url }, res);
    assert.equal(res.statusCode, 404);
  }
  const res = response();
  await serve({ method: "POST", url: "/index.html" }, res);
  assert.equal(res.statusCode, 405);
});
