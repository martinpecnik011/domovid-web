"""Domovid - balikova logika nad Google Sheetom "Domovid - klienti a zisk" (pre tools/dodaj_video.py).

Zalozky (riadok 1 = hlavicky): Klienti, Balíky, Videá. Vzorcove stlpce (Balíky G,H,K; Videá I,K,L) sa NIKDY nezapisuju.
Backend: zivy (composio proxy -> Sheets API) alebo falosny (env DOMOVID_SHEET_FAKE=/cesta/fake.json,
JSON {"Klienti": [[...]], "Balíky": [[...]], "Videá": [[...]]} citany/zapisovany na mieste).
Fail closed: akakolvek chyba => nikdy neodomykat (evaluate() nikdy nevyhodi vynimku).
"""
import json
import os
import re
import subprocess
import urllib.parse
import calendar
from datetime import date, datetime, timedelta

SHEET_ID = "1Zrc_k0x3GuTlQxI9XwfX3K8IT1M_3lyli8OFaCPo1Mo"
T_PKG, T_VID = "Balíky", "Videá"
# Balíky: A id, B klient, C zaciatok, D koniec, E cena bez DPH, F videi, I splatnost, J zaplatene dna
P_ID, P_CLIENT, P_START, P_END, P_NET, P_COUNT, P_DUE, P_PAID = 0, 1, 2, 3, 4, 5, 8, 9
# Videá: A datum, B klient, C balik, D video id, M stav, N odkaz
V_CLIENT, V_PKG, V_ID, V_STAV = 1, 2, 3, 12
VIDEO_PAID_STAV = "zaplatené – odomknuté"


def parse_date(s):
    """'29. 10. 2026' alebo '2026-10-29' -> date; prazdne/neplatne -> None."""
    s = str(s or "").strip()
    m = re.fullmatch(r"(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})", s) or None
    try:
        if m:
            return date(int(m[3]), int(m[2]), int(m[1]))
        return datetime.strptime(s[:10], "%Y-%m-%d").date() if s else None
    except ValueError:
        return None


def parse_num(s):
    """'140,00' / '140.00' / 140 -> float; prazdne/neplatne -> None."""
    s = str(s if s is not None else "").replace(" ", "").replace(" ", "").replace("€", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def cell(row, i):
    return str(row[i]).strip() if i < len(row) and row[i] is not None else ""


def col_letter(i):
    return chr(ord("A") + i)


# ---- backendy ----
class FakeBackend:
    def __init__(self, path):
        self.path = path

    def _load(self):
        with open(self.path, encoding="utf-8") as f:
            return json.load(f)

    def _save(self, data):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def rows(self, tab):
        return self._load()[tab]

    def append(self, tab, row):
        data = self._load()
        data[tab].append(row)
        self._save(data)

    def update(self, tab, row_no, col, value):
        data = self._load()
        row = data[tab][row_no - 1]
        row.extend([""] * (col + 1 - len(row)))
        row[col] = value
        self._save(data)


class LiveBackend:
    BASE = "https://sheets.googleapis.com/v4/spreadsheets/%s/values/" % SHEET_ID

    def _call(self, url, method="GET", body=None):
        cmd = ["composio", "proxy", url, "--toolkit", "googledrive", "--account", "domovid-upload"]
        if method != "GET":
            cmd += ["-X", method, "-H", "content-type: application/json", "-d", json.dumps(body, ensure_ascii=False)]
        # stdin=DEVNULL: composio proxy inak cita telo poziadavky zo zdedeneho stdin (pipe/heredoc) -> 400
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60, stdin=subprocess.DEVNULL)
        if r.returncode != 0:
            raise RuntimeError("composio proxy zlyhal: %s" % r.stderr[-300:])
        out = json.loads(r.stdout)
        if isinstance(out, dict) and "values" not in out and isinstance(out.get("data"), dict):
            out = out["data"]  # niektore verzie CLI obaluju odpoved do {"data": ...}
        return out

    def rows(self, tab):
        return self._call(self.BASE + urllib.parse.quote(tab, safe="")).get("values", [])

    def append(self, tab, row):
        # Nie values:append - ten by "" prepisal predvyplnene vzorce (G/H/K, I/K/L) a riadok by zaradil
        # za poznamky v stlpci N. Zapise len vyplnene bunky do prveho riadku s prazdnym stlpcom A.
        filled = [i for i, r in enumerate(self.rows(tab)) if cell(r, 0)]
        row_no = (filled[-1] + 2) if filled else 1
        data = [{"range": "%s!%s%d" % (tab, col_letter(c), row_no), "values": [[v]]}
                for c, v in enumerate(row) if v != "" and v is not None]
        sheet_id = self.BASE.split("/spreadsheets/")[1].split("/")[0]
        url = "https://sheets.googleapis.com/v4/spreadsheets/%s/values:batchUpdate" % sheet_id
        self._call(url, "POST", {"valueInputOption": "USER_ENTERED", "data": data})

    def update(self, tab, row_no, col, value):
        url = self.BASE + urllib.parse.quote("%s!%s%d" % (tab, col_letter(col), row_no), safe="") + "?valueInputOption=USER_ENTERED"
        self._call(url, "PUT", {"values": [[value]]})


def get_backend():
    fake = os.environ.get("DOMOVID_SHEET_FAKE")
    return FakeBackend(fake) if fake else LiveBackend()


# ---- logika balikov ----
def find_package(backend, pkg):
    """(riadok v Sheete, riadok dat) pre Balik ID, alebo (None, None)."""
    for i, row in enumerate(backend.rows(T_PKG)):
        if i and cell(row, P_ID) == pkg:
            return i + 1, row
    return None, None


def used_count(backend, pkg, video_id):
    return sum(1 for i, r in enumerate(backend.rows(T_VID)) if i and cell(r, V_PKG) == pkg and cell(r, V_ID) != video_id)


def next_package_id(pkg):
    """HALO-2026-10 -> HALO-2026-11, HALO-2026-12 -> HALO-2027-01; None, ak ID nema koncovy mesiac."""
    m = re.fullmatch(r"(.+)-(\d{4})-(\d{2})", pkg)
    if not m:
        return None
    y, mo = int(m[2]), int(m[3]) + 1
    if mo > 12:
        y, mo = y + 1, 1
    return "%s-%04d-%02d" % (m[1], y, mo)


def package_label(pkg, videos):
    return "Mesačný balík %s – %d %s" % (pkg, videos, "video" if videos == 1 else "videá" if videos < 5 else "videí")


def last_package_of(backend, client):
    best = None
    for i, row in enumerate(backend.rows(T_PKG)):
        if i and cell(row, P_CLIENT) == client:
            key = (parse_date(cell(row, P_START)) or date.min, i)
            if best is None or key >= best[0]:
                best = (key, row)
    return best[1] if best else None


def evaluate(pkg, video_id, today=None, backend=None):
    """Rozhodnutie pre dodanie s --reference PKG. Nikdy nevyhodi vynimku.

    -> {"state": "ok"|"unpaid"|"renewal"|"unknown", "warning": str|None, "price": {label, net}|None,
        "renewal": {...}|None, "client": str|None}
    """
    today = today or date.today()
    res = {"state": "unknown", "warning": None, "price": None, "renewal": None, "client": None}
    try:
        backend = backend or get_backend()
        _, row = find_package(backend, pkg)
        if row is None:
            res["warning"] = "balik %s sa nenasiel v Sheete - video ostava zamknute" % pkg
            return res
        videos = int(parse_num(cell(row, P_COUNT)) or 0)
        net = parse_num(cell(row, P_NET))
        res["client"] = cell(row, P_CLIENT)
        if net:
            res["price"] = {"label": package_label(pkg, videos), "net": net}
        if not cell(row, P_PAID):
            res["state"] = "unpaid"
            return res
        end = parse_date(cell(row, P_END))
        expired = bool(end and today > end)
        exhausted = used_count(backend, pkg, video_id) >= videos
        if not expired and not exhausted:
            res["state"] = "ok"
            return res
        res["state"] = "renewal"
        nxt = next_package_id(pkg)
        last = last_package_of(backend, res["client"]) or row
        r_videos, r_net = int(parse_num(cell(last, P_COUNT)) or videos), parse_num(cell(last, P_NET)) or net
        if not nxt or not r_net:
            res["state"] = "unknown"
            res["warning"] = "balik %s je %s, ale nepodarilo sa urcit dalsi balik - video ostava zamknute" % (pkg, "po termine" if expired else "vycerpany")
            return res
        res["renewal"] = {"package_id": nxt, "previous_package_id": pkg, "label": package_label(nxt, r_videos),
                          "videos": r_videos, "net": r_net, "reason": "expired" if expired else "exhausted"}
        res["warning"] = "balik %s je %s - video je zamknute, klient dostane vyzvu na obnovu %s" % (
            pkg, "po termine" if expired else "vycerpany", nxt)
    except Exception as e:  # fail closed
        res = {"state": "unknown", "warning": "Sheet nedostupny (%s) - video ostava zamknute" % e, "price": None, "renewal": None, "client": None}
    return res


def record_video(video_id, client, pkg, title, formats, link, stav, kling_credits=None, today=None, backend=None):
    """Prida riadok do Videá (len A-H, J, M, N), alebo pri existujucom Video ID aktualizuje iba Stav (M)."""
    backend = backend or get_backend()
    today = today or date.today()
    for i, row in enumerate(backend.rows(T_VID)):
        if i and cell(row, V_ID) == video_id:
            if cell(row, V_STAV) != stav:
                backend.update(T_VID, i + 1, V_STAV, stav)
            return "updated"
    row = ["%d. %d. %d" % (today.day, today.month, today.year), client, pkg, video_id, title, formats,
           "" if kling_credits is None else kling_credits, "0,0097", "", 0, "", "", stav, link]
    backend.append(T_VID, row)
    return "added"


def package_videos(backend, pkg):
    """[(riadok v Sheete, video id, stav)] pre vsetky Videá daneho balika."""
    return [(i + 1, cell(r, V_ID), cell(r, V_STAV)) for i, r in enumerate(backend.rows(T_VID)) if i and cell(r, V_PKG) == pkg and cell(r, V_ID)]


def mark_package_paid(backend, pkg, paid_date):
    """Zapise len Balíky!J (len ak prazdne). Vrati (riadok balika, zapisalo sa nieco)."""
    row_no, row = find_package(backend, pkg)
    if row is None:
        raise KeyError("balik %s sa nenasiel v Sheete" % pkg)
    changed = False
    if not cell(row, P_PAID):
        backend.update(T_PKG, row_no, P_PAID, paid_date.isoformat())
        changed = True
    return row_no, changed


def package_end(paid_date):
    """Datum platby + 1 mesiac - 1 den (2026-11-03 -> 2026-12-02)."""
    y, mo = (paid_date.year + 1, 1) if paid_date.month == 12 else (paid_date.year, paid_date.month + 1)
    return date(y, mo, min(paid_date.day, calendar.monthrange(y, mo)[1])) - timedelta(days=1)


def add_package_from_renewal(backend, renewal, client, paid_date):
    """Prida riadok do Balíky z podmienok obnovy (G, H, K = vzorce, I, L prazdne)."""
    iso = paid_date.isoformat()
    backend.append(T_PKG, [renewal["package_id"], client, iso, package_end(paid_date).isoformat(),
                           renewal["net"], renewal["videos"], "", "", "", iso, "", ""])


def reassign_video_package(backend, video_id, pkg):
    """Prepise Videá!C pre dany Video ID (ak sa lisi)."""
    for i, row in enumerate(backend.rows(T_VID)):
        if i and cell(row, V_ID) == video_id and cell(row, V_PKG) != pkg:
            backend.update(T_VID, i + 1, V_PKG, pkg)
