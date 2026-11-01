import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import dodaj_video  # noqa: E402


class BadgeTest(unittest.TestCase):
    def test_badge_text_and_no_old_watermark(self):
        for w, h in ((1080, 1920), (1920, 1080)):
            f = dodaj_video.badge_filter(w, h)
            self.assertIn("DEMO · DOMOVID", f)
            self.assertNotIn("NÁHĽAD", f)
            self.assertEqual(f.count("drawtext="), 1)

    def test_badge_is_top_right_not_bottom(self):
        f = dodaj_video.badge_filter(1080, 1920)
        self.assertIn("x=w-text_w-", f)
        self.assertIn("y=140", f)

    def test_preview_and_poster_use_same_badge(self):
        src = (ROOT / "tools" / "dodaj_video.py").read_text(encoding="utf-8")
        self.assertIn("badge_filter(w, h)", src.split("def encode_preview")[1].split("def encode_poster")[0])
        # poster sa kóduje z hotového náhľadu, takže má ten istý odznak
        self.assertIn("encode_poster(stage / pname, stage / postername", src)
        self.assertFalse(hasattr(dodaj_video, "watermark_filter"))


if __name__ == "__main__":
    unittest.main()
