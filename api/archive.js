const SOURCE = "https://arctic-shift.photon-reddit.com/api";
const COMMUNITY = /^[A-Za-z0-9_]{2,21}$/;

export function sourceUrl(input) {
  const query = new URL(input, "https://local.invalid").searchParams;
  const kind = query.get("kind");
  if (!["posts", "comments", "subreddits"].includes(kind))
    throw Error("Unknown archive route");
  const target = new URL(`${SOURCE}/${kind}/search`);
  if (kind === "subreddits") {
    const prefix = query.get("subreddit_prefix");
    if (!COMMUNITY.test(prefix || ""))
      throw Error("A subreddit prefix is required");
    target.search = new URLSearchParams({
      subreddit_prefix: prefix,
      limit: "8",
      fields: "display_name",
    });
  } else {
    const name = query.get("subreddit");
    if (!COMMUNITY.test(name || "")) throw Error("A subreddit is required");
    const after = Number(query.get("after")),
      before = Number(query.get("before"));
    const pulse =
      !query.has("after") && !query.has("before") && query.get("limit") === "1";
    if (
      !pulse &&
      (!Number.isInteger(after) ||
        !Number.isInteger(before) ||
        after < 0 ||
        before <= after ||
        before - after > 26 * 3600)
    )
      throw Error("Request one complete local day at a time");
    target.searchParams.set("subreddit", name);
    target.searchParams.set("sort", pulse ? "desc" : "asc");
    target.searchParams.set("limit", pulse ? "1" : "auto");
    if (!pulse) {
      target.searchParams.set("after", String(after));
      target.searchParams.set("before", String(before));
    }
    if (pulse)
      target.searchParams.set(
        "fields",
        "id,subreddit,created_utc,retrieved_on",
      );
    else if (kind === "comments")
      target.searchParams.set(
        "fields",
        "id,subreddit,created_utc,author,retrieved_on",
      );
  }
  return target.href;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Only GET is supported" });
  }
  let url;
  try {
    url = sourceUrl(req.url);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  try {
    // Only this public URL and an Accept header leave the server. Never forward
    // incoming cookies, Authorization, preview credentials, or arbitrary headers.
    const upstream = await fetch(url, {
      headers: { Accept: "application/json" },
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!upstream.ok) {
      const reset = upstream.headers.get("x-ratelimit-reset");
      if (reset && /^\d+$/.test(reset))
        res.setHeader("x-ratelimit-reset", reset);
      return res
        .status(upstream.status)
        .json({ error: `Archive returned HTTP ${upstream.status}` });
    }
    const reader = upstream.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4_000_000) {
        await reader.cancel();
        return res
          .status(413)
          .json({ error: "Source response exceeded the relay size limit" });
      }
      chunks.push(Buffer.from(value));
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(Buffer.concat(chunks));
  } catch {
    return res
      .status(502)
      .json({ error: "Archive relay could not complete the request" });
  }
}
