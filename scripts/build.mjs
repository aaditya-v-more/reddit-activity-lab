import fs from "node:fs";
import { inlineStarter } from "./starter-page.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, ".output");
fs.mkdirSync(out, { recursive: true });
// An explicit allowlist keeps raw records and local configuration out of deployments.
const files = [
  "index.html",
  "style.css",
  "app.js",
  "analysis.js",
  "archive.js",
  "archive-worker.js",
  "theme.js",
  "subreddit-picker.js",
];
for (const entry of fs.readdirSync(out))
  fs.rmSync(path.join(out, entry), { recursive: true, force: true });
for (const file of files)
  fs.copyFileSync(path.join(root, "dist", file), path.join(out, file));
// Only precomputed aggregate snapshots are public; individual records stay local.
fs.cpSync(path.join(root, "dist/starter"), path.join(out, "starter"), {
  recursive: true,
});
const entry = path.join(out, "index.html");
fs.writeFileSync(
  entry,
  inlineStarter(fs.readFileSync(entry, "utf8"))
    .replace('data-local-study="true"', 'data-local-study="false"')
    .replace(
      'data-archive-relay="false"',
      `data-archive-relay="${process.env.ARCHIVE_RELAY !== "0"}"`,
    ),
);
const starters = fs.readdirSync(path.join(out, "starter"));
const codeBytes = files.reduce(
  (sum, file) => sum + fs.statSync(path.join(out, file)).size,
  0,
);
const starterBytes = starters.reduce(
  (sum, file) => sum + fs.statSync(path.join(out, "starter", file)).size,
  0,
);
console.log(
  `Static website: ${codeBytes} bytes of application code and ${starterBytes} bytes across ${starters.length} aggregate snapshot files. No individual records bundled. The optional relay Function is built separately by Vercel.`,
);
