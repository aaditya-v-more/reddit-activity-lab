import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, ".output");
fs.mkdirSync(out, { recursive: true });
// Explicit files prevent raw data or legacy hosting configuration leaking into deployments.
const files = [
  "index.html",
  "style.css",
  "app.js",
  "analysis.js",
  "archive.js",
  "archive-worker.js",
];
for (const entry of fs.readdirSync(out))
  fs.rmSync(path.join(out, entry), { recursive: true, force: true });
for (const file of files)
  fs.copyFileSync(path.join(root, "dist", file), path.join(out, file));
const entry = path.join(out, "index.html");
fs.writeFileSync(
  entry,
  fs
    .readFileSync(entry, "utf8")
    .replace('data-local-study="true"', 'data-local-study="false"'),
);
console.log(
  `Static website: ${files.length} assets, ${files.reduce((sum, file) => sum + fs.statSync(path.join(out, file)).size, 0)} bytes. No dataset or server functions bundled.`,
);
