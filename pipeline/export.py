"""Export anonymous aggregates and public post evidence; never export authors."""

import datetime as dt
import hashlib
import json
import statistics
from collections import defaultdict
from zoneinfo import ZoneInfo
from .store import ROOT, DATA, connect, BOTS

ZONES = [
    "Asia/Kolkata",
    "UTC",
    "America/New_York",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Australia/Sydney",
]


def local_parts(timestamp, zone):
    d = dt.datetime.fromtimestamp(timestamp, dt.timezone.utc).astimezone(ZoneInfo(zone))
    return d.date().isoformat(), d.hour, d.weekday()


def aggregate(rows, zone, start, end):
    hours = {}
    daily_authors = defaultdict(set)
    # Explicit zero hours distinguish observed quiet from acquisition failure.
    # Real UTC hours also provide exposure for DST's repeated/missing hours.
    t = start
    while t < end:
        date, hour, day = local_parts(t, zone)
        key = (date, hour)
        hours.setdefault(key, [date, hour, day, 0, 0, set(), 0])
        hours[key][6] += min(1800, end - t) / 3600
        t += 1800
    for r in rows:
        if r["known_bot"]:
            continue
        date, hour, day = local_parts(r["created_utc"], zone)
        cell = hours.setdefault((date, hour), [date, hour, day, 0, 0, set(), 0])
        cell[3 if r["kind"] == "posts" else 4] += 1
        if r["author_key"]:
            cell[5].add(r["author_key"])
            daily_authors[date].add(r["author_key"])
    result = []
    for key, cell in sorted(hours.items()):
        cell[5] = len(cell[5])
        result.append(cell)
    return {
        "hours": result,
        "dailyAuthors": {k: len(v) for k, v in daily_authors.items()},
    }


def main():
    db = connect()
    out = ROOT / "dist" / "data"
    out.mkdir(exist_ok=True)
    manifest = {
        "schemaVersion": 1,
        "source": "Arctic Shift",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "zones": ZONES,
        "communities": [],
    }
    exported_intervals = []
    for sub in ["ClaudeAI", "ClaudeCode", "ollama"] + [
        r[0]
        for r in db.execute("SELECT DISTINCT subreddit FROM records")
        if r[0] not in ["ClaudeAI", "ClaudeCode", "ollama"]
    ]:
        coverage = [
            dict(r)
            for r in db.execute(
                "SELECT * FROM coverage WHERE subreddit=? AND complete=1 ORDER BY start,end",
                (sub,),
            )
        ]
        pairs = [
            (p, c)
            for p in coverage
            for c in coverage
            if p["kind"] == "posts"
            and c["kind"] == "comments"
            and p["start"] == c["start"]
            and p["end"] == c["end"]
        ]
        if not pairs:
            continue
        # Select the newest fully acquired paired interval. No partial data ships.
        p, c = max(pairs, key=lambda x: (x[0]["end"], x[0]["end"] - x[0]["start"]))
        start, end = p["start"], p["end"]
        exported_intervals.append((start, end))
        rows = [
            dict(r)
            for r in db.execute(
                "SELECT * FROM records WHERE subreddit=? AND created_utc>=? AND created_utc<? ORDER BY created_utc,id",
                (sub, start, end),
            )
        ]
        posts = []
        ages = []
        for r in rows:
            if r["kind"] != "posts":
                continue
            age = (
                (r["retrieved_2nd_on"] - r["created_utc"]) / 3600
                if r["retrieved_2nd_on"]
                else None
            )
            if age is not None:
                ages.append(age)
            reason = (
                "Known bot"
                if r["known_bot"]
                else (
                    "Removed/deleted"
                    if r["removed"]
                    else (
                        "Pinned"
                        if r["stickied"]
                        else (
                            "Snapshot age unavailable"
                            if age is None
                            else (
                                "Snapshot outside 35–40h"
                                if not 35 <= age <= 40
                                else (
                                    "Missing outcome"
                                    if r["score"] is None or r["num_comments"] is None
                                    else None
                                )
                            )
                        )
                    )
                )
            )
            posts.append(
                {
                    "id": r["id"],
                    "t": r["created_utc"],
                    "title": r["title"] or "[Title unavailable: removed/deleted]",
                    "score": r["score"],
                    "comments": r["num_comments"],
                    "flair": r["flair"],
                    "age": round(age, 4) if age is not None else None,
                    "snapshotAt": r["retrieved_2nd_on"],
                    "excluded": reason,
                    "bot": bool(r["known_bot"]),
                }
            )
        audits = {
            "records": len(rows),
            "posts": len(posts),
            "comments": sum(r["kind"] == "comments" for r in rows),
            "knownBotRecords": sum(r["known_bot"] for r in rows),
            "unattributedRecords": sum(not r["author_key"] for r in rows),
            "removedPosts": sum(r["kind"] == "posts" and r["removed"] for r in rows),
            "eligiblePosts": sum(p["excluded"] is None for p in posts),
            "snapshotAgeMedian": statistics.median(ages) if ages else None,
            "snapshotAgeMin": min(ages) if ages else None,
            "snapshotAgeMax": max(ages) if ages else None,
        }
        payload = {
            "subreddit": sub,
            "coverage": {
                "start": start,
                "end": end,
                "acquisitionComplete": True,
                "firstRecord": rows[0]["created_utc"],
                "lastRecord": rows[-1]["created_utc"],
                "fetchedAtMin": min(r["fetched_at"] for r in rows),
                "fetchedAtMax": max(r["fetched_at"] for r in rows),
                "completeness": "All pages exhausted for requested interval; archive capture completeness unknown.",
            },
            "audit": audits,
            "posts": posts,
            "zones": {z: aggregate(rows, z, start, end) for z in ZONES},
        }
        dest = out / (sub + ".json")
        dest.write_text(json.dumps(payload, separators=(",", ":")))
        manifest["communities"].append(
            {
                "name": sub,
                "file": dest.name,
                "bytes": dest.stat().st_size,
                "sha256": hashlib.sha256(dest.read_bytes()).hexdigest(),
                **audits,
            }
        )
        print(sub, json.dumps(audits), flush=True)
    manifest["knownBots"] = sorted(BOTS)
    if exported_intervals:
        start = max(a for a, b in exported_intervals) + 86400
        end = min(b for a, b in exported_intervals) - 2 * 86400
        if end < start:
            start, end = (
                exported_intervals[0][0] + 86400,
                exported_intervals[0][1] - 2 * 86400,
            )
        manifest["defaultStart"] = (
            dt.datetime.fromtimestamp(start, dt.timezone.utc).date().isoformat()
        )
        manifest["defaultEnd"] = (
            dt.datetime.fromtimestamp(end, dt.timezone.utc).date().isoformat()
        )
    if (DATA / "source-probe.json").exists():
        manifest["sourceProbe"] = json.loads((DATA / "source-probe.json").read_text())
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    ledger = [
        dict(r)
        for r in db.execute(
            "SELECT url,fetched_at,sha256,row_count,bytes FROM requests ORDER BY url"
        )
    ]
    (out / "provenance.json").write_text(json.dumps(ledger, separators=(",", ":")))


if __name__ == "__main__":
    main()
