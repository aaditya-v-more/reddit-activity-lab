# Data handling

The public repository contains source code, synthetic fixtures, aggregate findings, and methodology. Raw Reddit responses, SQLite, `dist/data/`, personal-post notes, local deployment configuration, and legacy private Git history are excluded from GitHub.

The hosted build contains an explicit allowlist of static code assets. It does not include a copy of the Reddit archive or the original study's exports. The browser requests selected public records directly from Arctic Shift with credentials omitted. No Reddit session token, cookie, private insight, unrelated credential, analytics tracker, or model API is used.

During acquisition, author names are used transiently in a Web Worker to compute distinct unions. Completed-day cache entries contain anonymous counts, redacted public post evidence, and request URLs, hashes, and timestamps. They do not contain author names, author hashes, comment bodies, user timelines, or selftext. The approximately 40 MB / 180-entry cache can be cleared from Methodology or by clearing site storage.

Public post titles are suppressed when the available archive metadata indicates removal/deletion. The site reflects the snapshot it acquired, not continuous deletion monitoring. Recent day caches expire after 15 minutes; older days after seven days; manual refresh bypasses the cache. Browser quota or eviction may remove data sooner.

The offline ignored `data/` directory contains original public responses, including text and author identities, for local reproducibility. Generated `dist/data/` study exports remain local and are excluded from Vercel uploads and static build output.

Reddit content rights belong to their respective rights holders. No general permission to redistribute an archive was established. Public code and statistical methods do not transfer rights to underlying records. Do not publish raw responses or a bulk dataset with this project.
