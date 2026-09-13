"""Offline invariants plus an optional independent reverse-order API spot check."""

import argparse
import datetime as dt
import gzip
import hashlib
import json
import subprocess
import time
from collections import defaultdict
from urllib.parse import urlencode
from .store import DATA, ROOT, connect


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--online", action="store_true")
    args = parser.parse_args()
    db = connect()
    checks = []
    raw_ids = defaultdict(set)
    bytes_total = 0
    for req in db.execute("SELECT * FROM requests"):
        with gzip.open(DATA / req["raw_file"], "rb") as f:
            payload = f.read()
        assert hashlib.sha256(payload).hexdigest() == req["sha256"], "Raw hash mismatch"
        data = json.loads(payload)["data"]
        assert len(data) == req["row_count"]
        bytes_total += len(payload)
        kind = "posts" if "/posts/search?" in req["url"] else "comments"
        for r in data:
            raw_ids[(r["subreddit"], kind)].add(r["id"])
    for key, ids in sorted(raw_ids.items()):
        local = {
            r[0]
            for r in db.execute(
                "SELECT id FROM records WHERE subreddit=? AND kind=?", key
            )
        }
        assert local == ids, (key, "Raw/database identity mismatch")
        checks.append(
            {
                "subreddit": key[0],
                "kind": key[1],
                "uniqueRecords": len(local),
                "rawIdentityParity": True,
            }
        )
    assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    for row in db.execute("SELECT * FROM coverage"):
        assert row["complete"] == 1, (
            "Acquisition incomplete for " + row["subreddit"] + " " + row["kind"]
        )
    manifest = json.loads((ROOT / "dist/data/manifest.json").read_text())
    for entry in manifest["communities"]:
        content = (ROOT / "dist/data" / entry["file"]).read_bytes()
        assert hashlib.sha256(content).hexdigest() == entry["sha256"]
        obj = json.loads(content)
        assert not any(
            k in content.decode()
            for k in ['"author":', '"author_key":', '"body":', '"selftext":']
        )
        assert len(obj["posts"]) == entry["posts"]
        for z, zone in obj["zones"].items():
            assert sum(h[3] for h in zone["hours"]) == sum(
                not p["bot"] for p in obj["posts"]
            )
            assert (
                sum(h[4] for h in zone["hours"])
                == db.execute(
                    "SELECT count(*) FROM records WHERE subreddit=? AND kind='comments' AND known_bot=0",
                    (entry["name"],),
                ).fetchone()[0]
            )
    online = []
    if args.online:
        for sub in [c["name"] for c in manifest["communities"]]:
            for kind in ["posts", "comments"]:
                for day in ["2026-08-02", "2026-09-02"]:
                    start = int(
                        dt.datetime.fromisoformat(day + "T18:00:00+00:00").timestamp()
                    )
                    end = start + 600
                    url = (
                        "https://arctic-shift.photon-reddit.com/api/"
                        + kind
                        + "/search?"
                        + urlencode(
                            dict(
                                subreddit=sub,
                                after=start - 1,
                                before=end,
                                sort="desc",
                                limit="auto",
                                fields="id,created_utc,subreddit",
                            )
                        )
                    )
                    for attempt in range(4):
                        proc = subprocess.run(
                            ["curl", "-fsS", "--max-time", "40", url],
                            capture_output=True,
                        )
                        if proc.returncode == 0:
                            break
                        time.sleep(2**attempt)
                    if proc.returncode:
                        raise RuntimeError("Independent spot check unavailable")
                    data = json.loads(proc.stdout)["data"]
                    if len(data) >= 100:
                        raise RuntimeError(
                            "Spot-check interval needs narrowing; refusing a capped sample"
                        )
                    source = {r["id"] for r in data if start <= r["created_utc"] < end}
                    local = {
                        r[0]
                        for r in db.execute(
                            "SELECT id FROM records WHERE subreddit=? AND kind=? AND created_utc>=? AND created_utc<?",
                            (sub, kind, start, end),
                        )
                    }
                    # A response below 100 proves the API did not cap this query.
                    assert source == local, (sub, kind, day, len(source), len(local))
                    online.append(
                        {
                            "url": url,
                            "sourceCount": len(source),
                            "localCount": len(local),
                            "idsMatch": True,
                            "responseSha256": hashlib.sha256(proc.stdout).hexdigest(),
                        }
                    )
                    time.sleep(0.6)
    report = {
        "verifiedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "sqliteIntegrity": "ok",
        "rawUncompressedBytes": bytes_total,
        "rawCompressedBytes": sum(
            p.stat().st_size for p in (DATA / "raw").glob("*.gz")
        ),
        "checks": checks,
        "exportHashesMatch": True,
        "aggregateOnlyParticipation": True,
        "reverseOrderSpotChecks": online,
    }
    (ROOT / "docs/validation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
