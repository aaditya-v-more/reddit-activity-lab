import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import archiveHandler from "../api/archive.js";
import { inlineStarter } from "./starter-page.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};
const assets = new Set([
  "/index.html",
  "/app.js",
  "/style.css",
  "/analysis.js",
  "/archive.js",
  "/archive-worker.js",
  "/theme.js",
  "/timezone.js",
  "/subreddit-picker.js",
]);

export function developmentHandler(relay = archiveHandler) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Provide the same response helpers used by the production Function.
    res.status = (status) => {
      res.statusCode = status;
      return res;
    };
    res.send = (body) => res.end(body);
    res.json = (body) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url, "http://127.0.0.1");
    if (
      url.pathname === "/api/archive" ||
      /^\/archive\/(posts|comments|subreddits)\/search$/.test(url.pathname)
    )
      return relay(req, res);
    if (!["GET", "HEAD"].includes(req.method)) return res.status(405).end();
    const name = url.pathname === "/" ? "/index.html" : url.pathname;
    if (
      !assets.has(name) &&
      !/^\/(starter|data)\/[A-Za-z0-9_-]+\.json$/.test(name)
    )
      return res.status(404).end("Not found");
    try {
      let content = await readFile(path.join(root, name));
      if (name === "/index.html")
        content = Buffer.from(
          inlineStarter(content.toString())
            .replace('data-archive-relay="false"', 'data-archive-relay="true"'),
        );
      res.setHeader(
        "Content-Type",
        `${types[path.extname(name)]}; charset=utf-8`,
      );
      res.status(200).end(req.method === "HEAD" ? undefined : content);
    } catch {
      res.status(404).end("Not found");
    }
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.REDDIT_LAB_PORT || 4317);
  const server = createServer(developmentHandler());
  server.on("error", (error) => {
    console.error(`Development server: ${error.code}`);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `Reddit Activity Lab: http://127.0.0.1:${port}/ (archive relay enabled)`,
    ),
  );
}
