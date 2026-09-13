# Project boundaries

- This repository is public. Never commit acquired Reddit records, `dist/data/`, browser cache exports, `.local/`, `.vercel/`, credentials, or personal-post notes.
- Do not deploy this project to ChatGPT Sites. The owner explicitly requested Vercel with its free-plan limits; retain portable static hosting as a fallback.
- Push only the public `main` branch. `private-site-history` is a local legacy backup containing data and must never be pushed to GitHub.
- Keep participant counts distinct from online users, scores distinct from exact upvotes, and historical archive timestamps distinct from the current time.
- Never silently turn a capped or failed acquisition into a complete analysis. Preserve source request provenance and expose freshness and missingness.
- No individual-user tracking features. Author identifiers may be used transiently to compute distinct counts; cache only anonymous aggregates and redacted public post evidence in the browser.
