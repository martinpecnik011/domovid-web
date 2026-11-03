import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import dodaj_video  # noqa: E402


class MasterPath(unittest.TestCase):
    def test_master_key_is_under_token_dir(self):
        self.assertEqual(dodaj_video.master_key("abc_-123", "T_Domovid_1080x1920.mp4"), "m-abc_-123/T_Domovid_1080x1920.mp4")

    def test_put_creates_token_dir_in_out_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "src.mp4"
            src.write_bytes(b"x")
            dodaj_video.Target(str(Path(tmp) / "out"), None).put("id1234567890", dodaj_video.master_key("tok", "a.mp4"), src)
            self.assertTrue((Path(tmp) / "out" / "id1234567890" / "m-tok" / "a.mp4").is_file())

    def test_load_private_converts_old_staging_without_leaking_to_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            stage = Path(tmp)
            m = {"id": "x", "downloads": [{"label": "l", "file": "f.mp4", "bytes": 1}]}
            p = dodaj_video.load_private(stage, m)
            self.assertNotIn("downloads", m)
            self.assertEqual(p["downloads"][0]["file"], "f.mp4")
            self.assertGreaterEqual(len(p["token"]), 32)
            self.assertEqual(dodaj_video.load_private(stage, {}), p)  # druhy raz z private.json
            self.assertEqual(json.loads((stage / "private.json").read_text())["token"], p["token"])


if __name__ == "__main__":
    unittest.main()
