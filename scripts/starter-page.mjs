import fs from "node:fs";

// Embed only the already-public aggregate snapshot, never acquired post records.
export function inlineStarter(html) {
  const manifest = JSON.parse(fs.readFileSync(new URL("../dist/starter/manifest.json", import.meta.url), "utf8"));
  const entry = manifest.entries.find((item) => item.subreddit === "AskReddit" && item.zone === "Asia/Kolkata");
  if (!entry || !/^[A-Za-z0-9_-]+\.json$/.test(entry.file))
    throw new Error("Default starter snapshot is missing");
  const snapshot = JSON.parse(fs.readFileSync(new URL(`../dist/starter/${entry.file}`, import.meta.url), "utf8"));
  const snapshots = manifest.entries.filter((item) => item.subreddit === "AskReddit").map((item) => {
    if (!/^[A-Za-z0-9_-]+\.json$/.test(item.file)) throw new Error("Invalid starter filename");
    return JSON.parse(fs.readFileSync(new URL(`../dist/starter/${item.file}`, import.meta.url), "utf8"));
  });
  // The acquisition ledger is identical across timezone variants. Embed it
  // once so high-volume communities do not multiply the initial page payload.
  const ledger = snapshot.ledger;
  const withoutLedger = (item) => ({ ...item, ledger: [] });
  const payload = JSON.stringify({ manifest, snapshot: withoutLedger(snapshot), snapshots: snapshots.map(withoutLedger), ledger }).replace(/</g, "\\u003c");
  return html.replace("<!-- starter-bootstrap -->", `<script id="starter-bootstrap" type="application/json">${payload}</script>`);
}
