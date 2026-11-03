import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import balik  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures" / "sheet.json"
FORMULA_VIDEA = (8, 10, 11)  # I, K, L
FORMULA_BALIKY = (6, 7, 10)  # G, H, K


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.path = os.path.join(self.tmp, "sheet.json")
        shutil.copy(FIXTURE, self.path)
        self.b = balik.FakeBackend(self.path)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def data(self):
        return json.loads(Path(self.path).read_text(encoding="utf-8"))


class Parsing(unittest.TestCase):
    def test_dates(self):
        self.assertEqual(balik.parse_date("29. 10. 2026"), date(2026, 10, 29))
        self.assertEqual(balik.parse_date("2026-10-29"), date(2026, 10, 29))
        self.assertIsNone(balik.parse_date(""))
        self.assertIsNone(balik.parse_date("blabla"))

    def test_numbers(self):
        self.assertEqual(balik.parse_num("0,0097"), 0.0097)
        self.assertEqual(balik.parse_num("140,00"), 140.0)
        self.assertEqual(balik.parse_num(140), 140.0)
        self.assertIsNone(balik.parse_num(""))

    def test_next_id(self):
        self.assertEqual(balik.next_package_id("HALO-2026-10"), "HALO-2026-11")
        self.assertEqual(balik.next_package_id("HALO-2026-12"), "HALO-2027-01")
        self.assertIsNone(balik.next_package_id("HALO"))


class Evaluate(Base):
    today = date(2026, 10, 31)

    def ev(self, pkg, vid="newvideo0001"):
        return balik.evaluate(pkg, vid, self.today, self.b)

    def test_paid_with_room_unlocks(self):
        r = self.ev("HALO-2026-10")
        self.assertEqual(r["state"], "ok")
        self.assertEqual(r["price"], {"label": "Mesačný balík HALO-2026-10 – 4 videá", "net": 140.0})

    def test_own_video_not_counted(self):
        self.assertEqual(self.ev("HALO-2026-12", "bbbbbbbb0004")["state"], "ok")

    def test_unpaid_locked(self):
        self.assertEqual(self.ev("HALO-2026-11")["state"], "unpaid")

    def test_exhausted_renewal_year_rollover(self):
        r = self.ev("HALO-2026-12")
        self.assertEqual(r["state"], "renewal")
        self.assertEqual(r["renewal"]["package_id"], "HALO-2027-01")
        self.assertEqual(r["renewal"]["previous_package_id"], "HALO-2026-12")
        self.assertEqual((r["renewal"]["videos"], r["renewal"]["net"], r["renewal"]["reason"]), (4, 140.0, "exhausted"))
        self.assertEqual(r["renewal"]["label"], "Mesačný balík HALO-2027-01 – 4 videá")
        self.assertTrue(r["warning"])

    def test_expired_renewal(self):
        r = self.ev("ACME-2026-05")
        self.assertEqual(r["state"], "renewal")
        self.assertEqual(r["renewal"]["reason"], "expired")
        self.assertEqual(r["renewal"]["package_id"], "ACME-2026-06")
        self.assertEqual((r["renewal"]["videos"], r["renewal"]["net"]), (3, 99.5))

    def test_unknown_reference_locked(self):
        r = self.ev("NOPE-2026-01")
        self.assertEqual(r["state"], "unknown")
        self.assertTrue(r["warning"])

    def test_backend_error_locked(self):
        class Boom:
            def rows(self, tab):
                raise RuntimeError("offline")
        r = balik.evaluate("HALO-2026-10", "x", self.today, Boom())
        self.assertEqual(r["state"], "unknown")
        self.assertIn("offline", r["warning"])


class Writes(Base):
    def record(self, stav, vid="newvideo0001"):
        return balik.record_video(vid, "Halo Klient", "HALO-2026-10", "Titul", "9:16", "https://example.test/?id=" + vid,
                                  stav, 120, date(2026, 10, 31), self.b)

    def test_append_idempotent(self):
        n = len(self.data()["Videá"])
        self.assertEqual(self.record("čaká na platbu"), "added")
        row = self.data()["Videá"][-1]
        self.assertEqual(row[:8], ["31. 10. 2026", "Halo Klient", "HALO-2026-10", "newvideo0001", "Titul", "9:16", 120, "0,0097"])
        self.assertEqual((row[8], row[10], row[11]), ("", "", ""))
        self.assertEqual(self.record("odomknuté"), "updated")
        d = self.data()["Videá"]
        self.assertEqual(len(d), n + 1)
        self.assertEqual(d[-1][12], "odomknuté")

    def test_master_columns_o_to_r(self):
        files = [{"label": "Stiahnuť v plnej kvalite (1080×1920)", "file": "T_Domovid_1080x1920.mp4", "bytes": 5}]
        self.record("čaká na platbu")
        self.assertEqual(self.data()["Videá"][-1][14:], ["", "", ""])  # bez tokenu su O-Q prazdne
        self.assertEqual(self.record_with("čaká na platbu", "tok123", files, False), "updated")
        row = self.data()["Videá"][-1]
        self.assertEqual((row[14], json.loads(row[15]), row[16]), ("tok123", files, ""))
        self.assertTrue(balik.set_unlocked("newvideo0001", backend=self.b))
        self.assertEqual(self.data()["Videá"][-1][16], "áno")
        self.assertFalse(balik.set_unlocked("neexistuje", backend=self.b))

    def record_with(self, stav, token, files, unlocked, vid="newvideo0001"):
        return balik.record_video(vid, "Halo Klient", "HALO-2026-10", "Titul", "9:16", "x", stav, None, date(2026, 10, 31), self.b,
                                  token=token, files=files, unlocked=unlocked)

    def test_new_row_has_o_p_q_and_is_approved_reads_r(self):
        self.record_with("odomknuté", "tok999", [{"label": "l", "file": "f.mp4", "bytes": 1}], True)
        row = self.data()["Videá"][-1]
        self.assertEqual((row[14], row[16], len(row)), ("tok999", "áno", 17))
        self.assertFalse(balik.is_approved("newvideo0001", self.b))
        self.b.update(balik.T_VID, len(self.data()["Videá"]), balik.V_APPROVED, "2026-11-02T10:00:00Z")
        self.assertTrue(balik.is_approved("newvideo0001", self.b))
        self.assertFalse(balik.is_approved("neexistuje", self.b))

    def test_formula_columns_untouched(self):
        before = self.data()
        self.record("čaká na platbu")
        self.record("odomknuté")
        balik.mark_package_paid(self.b, "HALO-2026-11", date(2026, 11, 3))
        after = self.data()
        for i in range(1, len(before["Videá"])):
            for c in FORMULA_VIDEA:
                self.assertEqual(before["Videá"][i][c], after["Videá"][i][c])
        for i in range(1, len(before["Balíky"])):
            for c in FORMULA_BALIKY:
                self.assertEqual(before["Balíky"][i][c], after["Balíky"][i][c])

    def test_package_paid_writes_j_only_once(self):
        _, changed = balik.mark_package_paid(self.b, "HALO-2026-11", date(2026, 11, 3))
        self.assertTrue(changed)
        row = self.data()["Balíky"][2]
        self.assertEqual(row[9], "2026-11-03")
        self.assertEqual(row[8], "")  # Splatnosť (I) sa nezapisuje
        _, changed = balik.mark_package_paid(self.b, "HALO-2026-11", date(2026, 11, 9))
        self.assertFalse(changed)
        self.assertEqual(self.data()["Balíky"][2][9], "2026-11-03")

    def test_renewal_package_created_and_video_reassigned(self):
        self.assertEqual(balik.package_end(date(2026, 11, 3)), date(2026, 12, 2))
        self.assertEqual(balik.package_end(date(2026, 12, 31)), date(2027, 1, 30))
        r = balik.evaluate("HALO-2026-12", "bbbbbbbb0004x", date(2026, 10, 31), self.b)["renewal"]
        balik.add_package_from_renewal(self.b, r, "Halo Klient", date(2026, 11, 3))
        row = self.data()["Balíky"][-1]
        self.assertEqual(row, ["HALO-2027-01", "Halo Klient", "2026-11-03", "2026-12-02", 140.0, 4, "", "", "", "2026-11-03", "", ""])
        balik.reassign_video_package(self.b, "bbbbbbbb0004", "HALO-2027-01")
        self.assertEqual(self.data()["Videá"][5][2], "HALO-2027-01")
        before = Path(self.path).read_bytes()
        balik.reassign_video_package(self.b, "bbbbbbbb0004", "HALO-2027-01")
        self.assertEqual(Path(self.path).read_bytes(), before)
        self.assertFalse(balik.mark_package_paid(self.b, "HALO-2027-01", date(2026, 11, 9))[1])
        self.assertEqual(Path(self.path).read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
