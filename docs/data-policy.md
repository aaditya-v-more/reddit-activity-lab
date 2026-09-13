# Data handling

The public repository contains source code, synthetic fixtures, aggregate findings, and methodology. Raw Reddit responses, SQLite, `dist/data/`, personal-post notes, local deployment configuration are excluded from GitHub.

The hosted build contains an explicit allowlist of static code assets and anonymous aggregate starter summaries, including source provenance. Starter summaries contain no post IDs, titles, authors, or bodies. It does not include a copy of the Reddit archive or the original study's exports. The browser requests selected public records directly from Arctic Shift with credentials omitted. No Reddit login, session cookie, private insight, or analytics tracker is used. When direct access fails, the hosted app can relay the same public query through Vercel. Site credentials are sent only to the same-origin relay to support protected deployments; no incoming cookie or authorization header is forwarded to Arctic Shift.

During acquisition, author names are used transiently in a Web Worker to compute distinct unions. Completed-day cache entries contain anonymous counts, redacted public post evidence, and request URLs, hashes, and timestamps. They do not contain author names, author hashes, comment bodies, user timelines, or selftext. Completed days and analyses are retained until **Clear local data** is used, or until the browser removes site storage. No automatic eviction policy runs in the app; new storage failures leave existing entries untouched.

Public post titles are suppressed when the available archive metadata indicates removal/deletion. The site reflects the snapshot it acquired, not continuous deletion monitoring. Recent day caches are checked for updates after 15 minutes; older days after seven days; manual refresh bypasses the cache. Browser quota or eviction may remove data sooner.

The offline ignored `data/` directory contains original public responses, including text and author identities, for local reproducibility. Generated `dist/data/` study exports remain local and are excluded from Vercel uploads and static build output.

Reddit content rights belong to their respective rights holders. No general permission to redistribute an archive was established. Public code and statistical methods do not transfer rights to underlying records. Do not publish raw responses or a bulk dataset with this project.
