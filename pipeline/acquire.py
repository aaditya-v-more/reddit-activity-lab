"""Small-scope Arctic Shift adapter. No Reddit session or API key is used."""

import argparse
import datetime as dt
import gzip
import hashlib
import json
import subprocess
import time
import tempfile
from urllib.parse import urlencode
from .store import DATA, connect, ingest

BASE = "https://arctic-shift.photon-reddit.com/api"


def epoch(value):
    return int(
        dt.datetime.fromisoformat(value).replace(tzinfo=dt.timezone.utc).timestamp()
    )


def fetch(db, url, refresh=False):
    cached = db.execute("SELECT * FROM requests WHERE url=?", (url,)).fetchone()
    if cached and not refresh:
        with gzip.open(DATA / cached["raw_file"], "rb") as f:
            payload = f.read()
        if hashlib.sha256(payload).hexdigest() != cached["sha256"]:
            raise ValueError("Cached response checksum mismatch")
        return json.loads(payload)["data"], cached["fetched_at"]
    for attempt in range(7):
        # curl's native TLS works on macOS where urllib was rejected by the edge.
        with tempfile.NamedTemporaryFile(prefix="reddit-headers-") as header_file:
            p = subprocess.run(
                [
                    "curl",
                    "-sS",
                    "--max-time",
                    "60",
                    "--compressed",
                    "-D",
                    header_file.name,
                    "-w",
                    "\n%{http_code}",
                    url,
                ],
                capture_output=True,
            )
            headers = header_file.read().decode(errors="replace")
        payload, _, code = p.stdout.rpartition(b"\n")
        if p.returncode == 0 and code == b"200":
            decoded = json.loads(payload)
            if not isinstance(decoded.get("data"), list):
                raise ValueError("Unexpected API envelope")
            now = dt.datetime.now(dt.timezone.utc).isoformat()
            digest = hashlib.sha256(payload).hexdigest()
            filename = "raw/" + hashlib.sha256(url.encode()).hexdigest() + ".json.gz"
            (DATA / "raw").mkdir(exist_ok=True)
            with gzip.open(DATA / filename, "wb") as f:
                f.write(payload)
            db.execute(
                "INSERT OR REPLACE INTO requests VALUES (?,?,?,?,?,?)",
                (url, now, digest, filename, len(decoded["data"]), len(payload)),
            )
            db.commit()
            time.sleep(0.6)
            return decoded["data"], now
        if code not in (b"422", b"429", b"500", b"502", b"503", b"504", b"000", b""):
            raise RuntimeError(
                "Archive HTTP " + code.decode(errors="replace") + " for " + url
            )
        retry_after = next(
            (
                line.split(":", 1)[1].strip()
                for line in headers.splitlines()
                if line.lower().startswith("x-ratelimit-reset:")
            ),
            None,
        )
        delay = (
            max(min(60, 2**attempt * 2), float(retry_after))
            if code == b"429" and retry_after and retry_after.isdigit()
            else min(60, 2**attempt * 2)
        )
        time.sleep(delay)
    raise RuntimeError("Archive unavailable after retries: " + url)


def acquire(db, subreddit, kind, start, end, refresh=False):
    done = db.execute(
        "SELECT complete FROM coverage WHERE subreddit=? AND kind=? AND start=? AND end=?",
        (subreddit, kind, start, end),
    ).fetchone()
    if done and done[0] and not refresh:
        print(f"{subreddit} {kind}: already complete", flush=True)
        return
    db.execute(
        "INSERT OR REPLACE INTO coverage VALUES (?,?,?,?,0,NULL)",
        (subreddit, kind, start, end),
    )
    db.commit()
    # Overlap the last second on every page, deduplicate by identity, and only
    # advance past that second after it is proven exhausted. This preserves ties.
    cursor = start - 1
    processed = 0
    while cursor < end:
        params = dict(
            subreddit=subreddit, after=cursor, before=end, sort="asc", limit="auto"
        )
        if kind == "comments":
            params["fields"] = "id,subreddit,author,created_utc,retrieved_on"
        url = BASE + "/" + kind + "/search?" + urlencode(params)
        records, now = fetch(db, url, refresh)
        if not records:
            break
        if any(r["subreddit"].casefold() != subreddit.casefold() for r in records):
            raise ValueError("Subreddit mismatch")
        accepted = [r for r in records if start <= r["created_utc"] < end]
        ingest(db, accepted, kind, now, url)
        db.commit()
        processed += len(accepted)
        last = max(int(r["created_utc"]) for r in records)
        print(
            f"{subreddit} {kind}: {processed:,} fetched through {dt.datetime.fromtimestamp(last,dt.timezone.utc).isoformat()}",
            flush=True,
        )
        if len(records) < 100:
            break  # auto returns at least 100 if a page is full
        if last - 1 <= cursor:
            # A saturated single second cannot be safely paginated by date.
            raise RuntimeError(
                "A full page shares one timestamp; use a dump adapter for this interval"
            )
        cursor = last - 1
    db.execute(
        "UPDATE coverage SET complete=1,completed_at=? WHERE subreddit=? AND kind=? AND start=? AND end=?",
        (dt.datetime.now(dt.timezone.utc).isoformat(), subreddit, kind, start, end),
    )
    db.commit()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--subreddits", nargs="+", default=["ClaudeAI", "ClaudeCode", "ollama"]
    )
    p.add_argument("--start", default="2026-07-27")
    p.add_argument("--end", default="2026-09-07", help="exclusive UTC end")
    p.add_argument(
        "--kinds",
        nargs="+",
        choices=["posts", "comments"],
        default=["posts", "comments"],
    )
    p.add_argument("--refresh", action="store_true")
    a = p.parse_args()
    start, end = epoch(a.start), epoch(a.end)
    if end <= start or end - start > 93 * 86400:
        p.error("Choose a positive interval of at most 93 days per run")
    if any(not s.replace("_", "").isalnum() for s in a.subreddits):
        p.error("Invalid subreddit")
    db = connect()
    for s in a.subreddits:
        for k in a.kinds:
            acquire(db, s, k, start, end, a.refresh)


if __name__ == "__main__":
    main()
