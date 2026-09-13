# Project boundaries

- This repository is public. Never commit acquired Reddit records, `dist/data/`, browser cache exports, `.local/`, `.vercel/`, credentials, or personal-post notes.
- Anonymous precomputed summaries in `dist/starter/` may be published. Do not include individual post IDs, titles, bodies, or author identifiers.
- Deploy to the existing Vercel project on the Hobby plan. Production uses `main`; retain portable static hosting as a fallback.
- Push only the public `main` branch. Local backup branches may contain acquired data and must never be pushed to GitHub.
- Keep participant counts distinct from online users, scores distinct from exact upvotes, and historical archive timestamps distinct from the current time.
- Never silently turn a capped or failed acquisition into a complete analysis. Preserve source request provenance and expose freshness and missingness.
- No individual-user tracking features. Author identifiers may be used transiently to compute distinct counts; cache only anonymous aggregates and redacted public post evidence in the browser.
