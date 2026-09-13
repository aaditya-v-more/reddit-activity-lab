import hashlib
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
BOTS = {
    "automoderator",
    "bot-sleuth-bot",
    "remindmebot",
    "haikusbot",
    "sneakpeekbot",
    "savevideo",
    "repostsleuthbot",
}


def connect(path=None):
    DATA.mkdir(exist_ok=True)
    db = sqlite3.connect(str(path or DATA / "reddit.sqlite"))
    db.row_factory = sqlite3.Row
    db.executescript(
        """
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS records (
      kind TEXT NOT NULL, id TEXT NOT NULL, subreddit TEXT NOT NULL,
      created_utc INTEGER NOT NULL, author_key TEXT, known_bot INTEGER NOT NULL,
      score INTEGER, num_comments INTEGER, title TEXT, flair TEXT,
      removed INTEGER NOT NULL, stickied INTEGER NOT NULL,
      retrieved_on INTEGER, retrieved_2nd_on INTEGER,
      fetched_at TEXT NOT NULL, source_url TEXT NOT NULL,
      PRIMARY KEY(kind,id));
    CREATE INDEX IF NOT EXISTS records_sub_time ON records(subreddit,created_utc);
    CREATE TABLE IF NOT EXISTS requests (
      url TEXT PRIMARY KEY, fetched_at TEXT NOT NULL, sha256 TEXT NOT NULL,
      raw_file TEXT NOT NULL, row_count INTEGER NOT NULL, bytes INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS coverage (
      subreddit TEXT NOT NULL, kind TEXT NOT NULL, start INTEGER NOT NULL,
      end INTEGER NOT NULL, complete INTEGER NOT NULL, completed_at TEXT,
      PRIMARY KEY(subreddit,kind,start,end));
    """
    )
    return db


def normalize(r, kind, fetched_at, url):
    if kind not in ("posts", "comments") or not r.get("id") or not r.get("subreddit"):
        raise ValueError("Missing record identity")
    timestamp = r.get("created_utc")
    if not isinstance(timestamp, (int, float)) or timestamp < 0:
        raise ValueError("Invalid creation timestamp")
    author = (r.get("author") or "").casefold()
    # Internal pseudonym only; no usernames are included in the website export.
    author_key = (
        hashlib.sha256((r["subreddit"].casefold() + ":" + author).encode()).hexdigest()
        if author not in ("", "[deleted]", "[removed]")
        else None
    )
    meta = r.get("_meta") or {}
    # Arctic Shift merges a later snapshot into the first observation. The
    # original removed_by_category can survive approval: restoration metadata
    # must override that stale field. Explicit later removal still wins.
    edited_title = str(meta.get("edited_title") or "").casefold()
    title_removed = edited_title.startswith("[ removed") or edited_title in (
        "[deleted]",
        "[removed]",
    )
    removed = bool(
        meta.get("was_deleted_later")
        or r.get("selftext") in ("[removed]", "[deleted]")
        or title_removed
        or (r.get("removed_by_category") and not meta.get("was_initially_deleted"))
    )

    def number(name):
        v = r.get(name)
        return (
            int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None
        )

    return (
        kind,
        r["id"].removeprefix("t3_").removeprefix("t1_"),
        r["subreddit"],
        int(timestamp),
        author_key,
        int(author in BOTS),
        number("score"),
        number("num_comments"),
        None if removed else r.get("title"),
        r.get("link_flair_text"),
        int(removed),
        int(bool(r.get("stickied"))),
        number("retrieved_on"),
        meta.get("retrieved_2nd_on"),
        fetched_at,
        url,
    )


def ingest(db, records, kind, fetched_at, url):
    rows = [normalize(r, kind, fetched_at, url) for r in records]
    # A retry cannot overwrite a later archive observation with an older one.
    db.executemany(
        """INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(kind,id) DO UPDATE SET
        author_key=excluded.author_key,known_bot=excluded.known_bot,
        score=excluded.score,num_comments=excluded.num_comments,title=excluded.title,
        flair=excluded.flair,removed=excluded.removed,stickied=excluded.stickied,
        retrieved_on=excluded.retrieved_on,retrieved_2nd_on=excluded.retrieved_2nd_on,
        fetched_at=excluded.fetched_at,source_url=excluded.source_url
      WHERE COALESCE(excluded.retrieved_2nd_on,excluded.retrieved_on,0)>=COALESCE(records.retrieved_2nd_on,records.retrieved_on,0)""",
        rows,
    )
    return len(rows)
