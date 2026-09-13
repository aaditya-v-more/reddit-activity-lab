# Data handling

The public repository contains source code, synthetic test fixtures, aggregate findings, and methodology. The local `data/` and `dist/data/` directories, personal-post validation notes, and `.openai/` hosting configuration are excluded from its entire published Git history.

`data/` contains source responses and the SQLite analytical store, including archived post text or author identities in raw responses. Raw responses and SQLite are not included in the Site archive. `dist/data/` contains generated dashboard exports and is used only locally or on private hosting.

The website contains aggregate date/hour participation counts and public post evidence. It does not expose raw authors, author hashes, comment bodies, user timelines, or private insights. Moderation-aware redaction reflects available archive metadata at collection; future deletion requests require refreshing or removing the affected export.

No Reddit session token, user cookie, browser history, unrelated project credential, analytics tracker, or model API is used. The optional original live-count experiment was not attempted. Private Sites hosting enforces owner-only access.

Reddit content rights belong to their respective rights holders. No permission to publicly redistribute archive content has been established. The project's source code and statistical methods do not transfer rights to the underlying records. Keep the exports private unless authorized otherwise.
