"""Replay verified cached responses after a normalization change; no network."""

import gzip
import hashlib
import json
from .store import DATA, connect, ingest


def main():
    db = connect()
    requests = list(db.execute("SELECT * FROM requests ORDER BY fetched_at,url"))
    count = 0
    for request in requests:
        url = request["url"]
        kind = (
            "posts"
            if "/posts/search?" in url
            else "comments" if "/comments/search?" in url else None
        )
        if not kind:
            continue
        with gzip.open(DATA / request["raw_file"], "rb") as f:
            payload = f.read()
        if hashlib.sha256(payload).hexdigest() != request["sha256"]:
            raise ValueError("Cached response checksum mismatch")
        records = json.loads(payload)["data"]
        accepted = []
        for r in records:
            if db.execute(
                "SELECT 1 FROM coverage WHERE subreddit=? AND kind=? AND start<=? AND end>?",
                (r["subreddit"], kind, r["created_utc"], r["created_utc"]),
            ).fetchone():
                accepted.append(r)
        count += ingest(db, accepted, kind, request["fetched_at"], url)
        db.commit()
    print(
        "Replayed",
        count,
        "records, including overlapping pages; primary keys deduplicate.",
    )


if __name__ == "__main__":
    main()
