import datetime as dt
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlparse, parse_qs
from pathlib import Path
from pipeline.store import connect, ingest, normalize
from pipeline.export import aggregate, local_parts
from pipeline.acquire import acquire


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = connect(Path(self.tmp.name) / "test.sqlite")

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def record(self, **extra):
        r = dict(
            id="abc",
            subreddit="ollama",
            created_utc=100,
            author="Example",
            score=5,
            num_comments=2,
            title="A post",
            retrieved_on=110,
            _meta={"retrieved_2nd_on": 129700},
        )
        r.update(extra)
        return r

    def test_deduplication_and_newer_snapshot_wins(self):
        ingest(self.db, [self.record(), self.record()], "posts", "now", "url")
        self.assertEqual(
            self.db.execute("select count(*) from records").fetchone()[0], 1
        )
        ingest(
            self.db,
            [self.record(score=100, _meta={"retrieved_2nd_on": 129800})],
            "posts",
            "later",
            "url2",
        )
        ingest(self.db, [self.record(score=1)], "posts", "old", "url3")
        self.assertEqual(
            self.db.execute("select score from records").fetchone()[0], 100
        )

    def test_deleted_author_not_counted_as_one_person(self):
        self.assertIsNone(
            normalize(self.record(author="[deleted]"), "posts", "now", "url")[4]
        )
        self.assertIsNone(normalize(self.record(author=None), "posts", "now", "url")[4])
        self.assertEqual(
            normalize(self.record(author="AutoModerator"), "posts", "now", "url")[5], 1
        )

    def test_removed_title_redacted(self):
        r = normalize(
            self.record(_meta={"was_deleted_later": True}), "posts", "now", "url"
        )
        self.assertIsNone(r[8])
        self.assertEqual(r[10], 1)

    def test_restored_post_overrides_stale_initial_moderation_field(self):
        restored = self.record(
            removed_by_category="automod_filtered",
            selftext="Restored body",
            _meta={"was_initially_deleted": True, "retrieved_2nd_on": 129700},
        )
        r = normalize(restored, "posts", "now", "url")
        self.assertEqual(r[10], 0)
        self.assertEqual(r[8], "A post")
        restored["_meta"]["edited_title"] = "[ Removed by moderator ]"
        self.assertEqual(normalize(restored, "posts", "now", "url")[10], 1)

    def test_invalid_records_fail_closed(self):
        with self.assertRaises(ValueError):
            normalize(self.record(created_utc="yesterday"), "posts", "now", "url")

    def test_participants_union_across_posts_comments_and_daily(self):
        start = int(dt.datetime(2026, 8, 1, tzinfo=dt.timezone.utc).timestamp())
        rows = [
            dict(kind="posts", created_utc=start, known_bot=0, author_key="a"),
            dict(kind="comments", created_utc=start + 10, known_bot=0, author_key="a"),
            dict(kind="comments", created_utc=start + 20, known_bot=0, author_key="b"),
            dict(kind="comments", created_utc=start + 30, known_bot=0, author_key=None),
            dict(
                kind="comments", created_utc=start + 40, known_bot=1, author_key="bot"
            ),
        ]
        x = aggregate(rows, "UTC", start, start + 86400)
        cell = x["hours"][0]
        self.assertEqual(cell[3:6], [1, 3, 2])
        self.assertEqual(x["dailyAuthors"]["2026-08-01"], 2)
        self.assertEqual(len(x["hours"]), 24)

    def test_half_hour_timezone_exposure_and_rollover(self):
        start = int(dt.datetime(2026, 8, 2, 18, 30, tzinfo=dt.timezone.utc).timestamp())
        self.assertEqual(local_parts(start, "Asia/Kolkata"), ("2026-08-03", 0, 0))
        x = aggregate([], "Asia/Kolkata", start, start + 86400)
        self.assertEqual(sum(h[6] for h in x["hours"]), 24)
        self.assertEqual(x["hours"][0][6], 1)

    def test_dst_hour_exposure(self):
        start = int(dt.datetime(2026, 11, 1, 4, tzinfo=dt.timezone.utc).timestamp())
        x = aggregate([], "America/New_York", start, start + 25 * 3600)
        self.assertEqual(len(x["hours"]), 24)
        self.assertEqual(sum(h[6] for h in x["hours"]), 25)
        self.assertEqual(next(h[6] for h in x["hours"] if h[1] == 1), 2)

    def test_pagination_preserves_timestamp_ties_and_reruns(self):
        records = [self.record(id=str(i), created_utc=100 + i // 2) for i in range(245)]

        def fake_fetch(db, url, refresh):
            p = parse_qs(urlparse(url).query)
            after = int(p["after"][0])
            before = int(p["before"][0])
            return [r for r in records if after < r["created_utc"] < before][
                :100
            ], "now"

        with patch("pipeline.acquire.fetch", fake_fetch), patch("builtins.print"):
            acquire(self.db, "ollama", "posts", 100, 300)
            self.assertEqual(
                self.db.execute("select count(*) from records").fetchone()[0], 245
            )
            acquire(self.db, "ollama", "posts", 100, 300)
            self.assertEqual(
                self.db.execute("select count(*) from records").fetchone()[0], 245
            )

    def test_failed_acquisition_never_marks_coverage_complete(self):
        with patch("pipeline.acquire.fetch", side_effect=RuntimeError("unavailable")):
            with self.assertRaises(RuntimeError):
                acquire(self.db, "ollama", "posts", 100, 300)
        self.assertEqual(
            self.db.execute("select complete from coverage").fetchone()[0], 0
        )


if __name__ == "__main__":
    unittest.main()
