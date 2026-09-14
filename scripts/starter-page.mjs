import fs from "node:fs";

// Embed only the already-public aggregate snapshot, never acquired post records.
export function inlineStarter(html) {
  const manifest = JSON.parse(fs.readFileSync(new URL("../dist/starter/manifest.json", import.meta.url), "utf8"));
  const entry = manifest.entries.find((item) => item.subreddit === "ollama" && item.zone === "Asia/Kolkata");
  if (!entry || !/^[A-Za-z0-9_-]+\.json$/.test(entry.file))
    throw new Error("Default starter snapshot is missing");
  const snapshot = JSON.parse(fs.readFileSync(new URL(`../dist/starter/${entry.file}`, import.meta.url), "utf8"));
  const snapshots = manifest.entries.filter((item) => item.subreddit === "ollama").map((item) => {
    if (!/^[A-Za-z0-9_-]+\.json$/.test(item.file)) throw new Error("Invalid starter filename");
    return JSON.parse(fs.readFileSync(new URL(`../dist/starter/${item.file}`, import.meta.url), "utf8"));
  });
  const payload = JSON.stringify({ manifest, snapshot, snapshots }).replace(/</g, "\\u003c");
  return html.replace("<!-- starter-bootstrap -->", `<script id="starter-bootstrap" type="application/json">${payload}</script>`);
}
