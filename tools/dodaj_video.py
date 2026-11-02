#!/usr/bin/env python3
"""Domovid - odovzdanie hotoveho videa klientovi (nahlad s odznakom DEMO · DOMOVID + master po zaplateni).

Pouzitie: pozri tools/README-dodanie.md. Len standardna kniznica Pythonu + ffmpeg.
"""
import argparse
import json
import os
import re
import secrets
import shutil
import string
import subprocess
import sys
import tempfile
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import balik

os.environ["PATH"] = "/opt/homebrew/bin:" + os.environ.get("PATH", "")

BASE_URL = "https://martinpecnik011.github.io/domovid-web/video/"
BADGE = "DEMO · DOMOVID"
FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
ID_RE = re.compile(r"^[a-z0-9]{8,32}$")
SINGLE_VIDEO_NET = 50  # cena jedneho videa bez DPH (alternativa k obnove balika)
PORTRAIT, LANDSCAPE = (1080, 1920), (1920, 1080)


def die(msg):
    sys.exit("CHYBA: " + msg)


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        die("zlyhal prikaz %s\n%s" % (cmd[0], r.stderr[-1500:]))
    return r.stdout


def need_tool(name):
    if not shutil.which(name):
        die("%s sa nenasiel (ocakavam /opt/homebrew/bin)" % name)


def slugify(title):
    s = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    words = re.findall(r"[A-Za-z0-9]+", s)
    return "".join(w[:1].upper() + w[1:] for w in words) or "Video"


def dt_escape(text):
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace("%", "\\%")


def find_font():
    for f in FONTS:
        if os.path.exists(f):
            return f
    die("nenasiel som font so slovenskymi znakmi (skusene: %s)" % ", ".join(FONTS))


def has_audio(video):
    out = run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(video)])
    return bool(out.strip())


def scale(w, h):
    return "scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2:black,setsar=1" % (w, h, w, h)


def badge_filter(w, h):
    """Maly rohovy odznak (vpravo hore, mimo Reels spodneho UI) namiesto velkeho vodoznaku."""
    font = dt_escape(find_font())
    text = dt_escape(BADGE)
    size = max(20, min(w, h) // 45)
    return ",".join([scale(w, h),
                     "drawtext=fontfile='%s':text='%s':fontsize=%d:fontcolor=white@0.7:"
                     "box=1:boxcolor=black@0.3:boxborderw=8:x=w-text_w-48:y=140" % (font, text, size)])


def encode_preview(src, dst, w, h):
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(src), "-vf", badge_filter(w, h),
           "-c:v", "libx264", "-crf", "23", "-preset", "medium", "-pix_fmt", "yuv420p"]
    cmd += ["-c:a", "aac", "-b:a", "128k"] if has_audio(src) else ["-an"]
    run(cmd + ["-movflags", "+faststart", str(dst)])


def encode_poster(src, dst, w, h):
    run(["ffmpeg", "-y", "-v", "error", "-ss", "1", "-i", str(src), "-vf", scale(w, h), "-frames:v", "1", "-q:v", "3", str(dst)])


def encode_master(src, dst, w, h):
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(src), "-vf", scale(w, h), "-c:v", "libx264", "-profile:v", "high",
           "-crf", "12", "-preset", "slow", "-maxrate", "30M", "-bufsize", "60M", "-pix_fmt", "yuv420p"]
    cmd += ["-c:a", "aac", "-b:a", "320k"] if has_audio(src) else ["-an"]
    run(cmd + ["-movflags", "+faststart", str(dst)])


def probe_duration(video):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)]).strip())


def master_name(title, w, h):
    return "%s_Domovid_%dx%d.mp4" % (slugify(title), w, h)


def download_entry(title, w, h, master_bytes):
    return {"label": "Stiahnuť v plnej kvalite (%d×%d)" % (w, h), "file": master_name(title, w, h), "bytes": master_bytes}


def write_manifest(path, m):
    path.write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def price_from_args(a):
    """Volitelne pole price do manifestu; None, ak nebolo zadane --price-net."""
    if a.price_net is None:
        if a.price_label or a.reference:
            die("--price-label/--reference bez --price-net")
        return None
    if a.price_net <= 0:
        die("--price-net musi byt vacsie ako 0")
    if not a.price_label or not a.reference:
        die("k --price-net zadaj aj --price-label a --reference")
    return build_price(a.price_label, a.price_net, a.vat_rate, a.reference, a.iban_file)


def build_price(label, net, vat_rate, reference, iban_file):
    price = {"label": label, "net": net, "vat_rate": vat_rate, "reference": reference}
    iban = read_iban(iban_file)
    if iban:
        price["iban"] = iban
    return price


def read_iban(path):
    """IBAN zo suboru (prvy neprazdny riadok, bez medzier, velkymi); None, ak subor chyba. Neplatny = die()."""
    p = Path(path).expanduser()
    if not p.is_file():
        return None
    lines = [l for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
    iban = "".join(lines[0].split()).upper() if lines else ""
    if not re.fullmatch(r"[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}", iban):
        die("IBAN v %s ma neplatny format" % p)
    digits = "".join(str(int(c, 36)) for c in iban[4:] + iban[:4])
    if int(digits) % 97 != 1:
        die("IBAN v %s ma neplatny kontrolny sucet" % p)
    return iban


def set_price_in(mf, price):
    m = json.loads(mf.read_text(encoding="utf-8"))
    old_iban = (m.get("price") or {}).get("iban")
    m["price"] = dict(price, iban=old_iban) if old_iban and "iban" not in price else price
    write_manifest(mf, m)


# ---- publikovanie (local / R2) ----
CTYPES = {".mp4": "video/mp4", ".jpg": "image/jpeg", ".json": "application/json"}


class Target:
    def __init__(self, out_dir, bucket):
        self.out_dir, self.bucket = out_dir, bucket

    def put(self, id_, name, path, attachment=False):
        if self.out_dir:
            dest = Path(self.out_dir) / id_
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, dest / name)
            return
        cmd = ["npx", "wrangler", "r2", "object", "put", "%s/%s/%s" % (self.bucket, id_, name),
               "--file", str(path), "--remote", "--content-type", CTYPES[Path(name).suffix]]
        if name == "manifest.json":
            cmd += ["--cache-control", "no-store"]
        if attachment:
            cmd += ["--content-disposition", 'attachment; filename="%s"' % name]
        run(cmd)
        print("  nahrane: %s/%s" % (id_, name))


def publish_master(t, id_, m, stage):
    for d in m["downloads"]:
        t.put(id_, d["file"], stage / d["file"], attachment=True)


def summary(id_, stage, m):
    print("\nID: %s" % id_)
    for d in m["downloads"]:
        mb = d["bytes"] / 1e6
        dur = probe_duration(stage / d["file"])
        print("Master: %s  %.1f MB  %.1f Mb/s" % (d["file"], mb, d["bytes"] * 8 / dur / 1e6))
    print("Stav: %s" % ("ZAPLATENE (master publikovany)" if m["paid"] else "NEZAPLATENE (iba nahlad)"))
    print("Odkaz pre klienta: %s?id=%s" % (BASE_URL, id_))


def mark_paid(id_, t, staging_root, a):
    stage = staging_root / id_
    mf = stage / "manifest.json"
    if not mf.exists():
        die("nenasiel som %s - bolo video pripravene s tymto staging adresarom?" % mf)
    m = json.loads(mf.read_text(encoding="utf-8"))
    for d, (flag, source, (w, h)) in zip(m["downloads"], (("--source", a.source, PORTRAIT), ("--source-16x9", a.source_16x9, LANDSCAPE))):
        master = stage / d["file"]
        if not master.exists():
            if not source:
                die("master %s chyba v %s, zadaj %s VIDEO" % (d["file"], stage, flag))
            print("Master chyba, kodujem znova zo %s ..." % flag)
            encode_master(source, master, w, h)
            d["bytes"] = master.stat().st_size
    m["paid"] = True
    publish_master(t, id_, m, stage)
    write_manifest(mf, m)
    t.put(id_, "manifest.json", mf)
    return m


def package_paid(a, t, staging_root):
    """--package-paid PKG: zapise platbu do Sheetu a odomkne vsetky videa balika (opakovanie = nic)."""
    pkg = a.package_paid
    try:
        paid_date = date.fromisoformat(a.paid_date) if a.paid_date else date.today()
    except ValueError:
        die("--paid-date ocakava YYYY-MM-DD")
    backend = balik.get_backend()
    renewals = []  # odlozene manifesty, ktore ponukli tento balik ako obnovu
    for mf in sorted(staging_root.glob("*/manifest.json")):
        try:
            m = json.loads(mf.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if (m.get("renewal") or {}).get("package_id") == pkg:
            renewals.append((mf.parent.name, m))
    changed = False
    if renewals and balik.find_package(backend, pkg)[1] is None:
        balik.add_package_from_renewal(backend, renewals[0][1]["renewal"], renewals[0][1]["client"], paid_date)
        changed = True
    for vid, m in renewals:
        balik.reassign_video_package(backend, vid, pkg)
        del m["renewal"]
        write_manifest(staging_root / vid / "manifest.json", m)
        mark_paid(vid, t, staging_root, a)  # publikuje aj manifest bez bloku renewal
        print("Odomknute (obnova): %s" % vid)
        changed = True
    try:
        _, c = balik.mark_package_paid(backend, pkg, paid_date)
        changed = changed or c
    except KeyError as e:
        die(str(e))
    failed = 0
    for row_no, vid, stav in balik.package_videos(backend, pkg):
        mf = staging_root / vid / "manifest.json"
        if mf.exists() and json.loads(mf.read_text(encoding="utf-8")).get("paid"):
            print("Uz odomknute: %s" % vid)
        else:
            try:
                mark_paid(vid, t, staging_root, a)
                changed = True
                print("Odomknute: %s" % vid)
            except SystemExit as e:
                failed += 1
                print("%s" % e)
                continue
        if stav != balik.VIDEO_PAID_STAV:
            backend.update(balik.T_VID, row_no, balik.V_STAV, balik.VIDEO_PAID_STAV)
            changed = True
    print("Balik %s: %s" % (pkg, "zaplateny a videa odomknute" if changed else "uz bol zaplateny, nic na zmenu"))
    if failed:
        die("%d video(a) sa nepodarilo odomknut" % failed)


def main():
    ap = argparse.ArgumentParser(description="Odovzdanie videa klientovi (nahlad + master po zaplateni).")
    ap.add_argument("video", nargs="?", help="zdrojove video (nikdy sa nemeni)")
    ap.add_argument("--client")
    ap.add_argument("--title")
    ap.add_argument("--id")
    ap.add_argument("--paid", action="store_true", help="hned publikovat aj master")
    ap.add_argument("--mark-paid", metavar="ID", help="oznacit za zaplatene a publikovat master")
    ap.add_argument("--video-16x9", help="volitelna 16:9 verzia (1920x1080) toho isteho videa")
    ap.add_argument("--source", help="pri --mark-paid: znovu zakodovat z tohto videa, ak chyba master v staging")
    ap.add_argument("--source-16x9", help="pri --mark-paid: znovu zakodovat 16:9 master z tohto videa, ak chyba v staging")
    ap.add_argument("--price-net", type=float, help="cena bez DPH (volitelne pole price v manifeste)")
    ap.add_argument("--price-label", help="popis ceny, napr. nazov balika")
    ap.add_argument("--reference", help="referencia platby, napr. HALO-2026-10")
    ap.add_argument("--package-paid", metavar="PKG", help="balik zaplateny: zapise Sheet a odomkne vsetky jeho videa")
    ap.add_argument("--paid-date", help="pri --package-paid: datum platby YYYY-MM-DD (default dnes)")
    ap.add_argument("--kling-credits", type=int, help="spotrebovane Kling kredity (zapise sa do Sheetu)")
    ap.add_argument("--single-price", type=float, default=SINGLE_VIDEO_NET, help="cena jedneho videa bez DPH v bloku renewal (default 50)")
    ap.add_argument("--vat-rate", type=float, default=0.23, help="sadzba DPH (default 0.23)")
    ap.add_argument("--iban-file", default="~/.config/domovid/iban.txt", help="subor s IBAN (default ~/.config/domovid/iban.txt); cita sa len pri zadanej cene")
    ap.add_argument("--set-price", metavar="ID", help="dodatocne nastavit cenu v manifeste (bez prekodovania)")
    ap.add_argument("--out-dir")
    ap.add_argument("--r2-bucket")
    ap.add_argument("--staging-dir", help="kde ostane master do zaplatenia (default: OUT/.master alebo ~/.domovid-delivery)")
    a = ap.parse_args()

    if bool(a.out_dir) == bool(a.r2_bucket):
        die("zadaj presne jedno z --out-dir / --r2-bucket")
    for tool in ("ffmpeg", "ffprobe"):
        need_tool(tool)
    t = Target(a.out_dir, a.r2_bucket)
    staging_root = Path(a.staging_dir or (Path(a.out_dir) / ".master" if a.out_dir else Path.home() / ".domovid-delivery"))

    pkg_mode = bool(a.reference) and a.price_net is None and not a.set_price
    price = None if pkg_mode else price_from_args(a)

    if a.set_price:
        id_ = a.set_price
        if not ID_RE.match(id_):
            die("neplatne ID (povolene [a-z0-9]{8,32})")
        if not price:
            die("--set-price vyzaduje --price-net, --price-label a --reference")
        if a.out_dir:
            pub = Path(a.out_dir) / id_ / "manifest.json"
            if not pub.exists():
                die("nenasiel som %s" % pub)
            set_price_in(pub, price)
        else:
            with tempfile.TemporaryDirectory() as tmp:
                pub = Path(tmp) / "manifest.json"
                run(["npx", "wrangler", "r2", "object", "get", "%s/%s/manifest.json" % (a.r2_bucket, id_),
                     "--remote", "--file", str(pub)])
                set_price_in(pub, price)
                t.put(id_, "manifest.json", pub)
        staged = staging_root / id_ / "manifest.json"
        if staged.exists():
            set_price_in(staged, price)
        print("Cena nastavena: %s (%s bez DPH, ref. %s, IBAN: %s)" % (id_, price["net"], price["reference"], "ano" if price.get("iban") else "nie"))
        return

    if a.mark_paid:
        if not ID_RE.match(a.mark_paid):
            die("neplatne ID (povolene [a-z0-9]{8,32})")
        summary(a.mark_paid, staging_root / a.mark_paid, mark_paid(a.mark_paid, t, staging_root, a))
        return

    if a.package_paid:
        package_paid(a, t, staging_root)
        return

    if not a.video or not a.client or not a.title:
        die("zadaj VIDEO, --client a --title (alebo --mark-paid ID)")
    src = Path(a.video)
    if not src.is_file():
        die("zdrojove video neexistuje: %s" % src)
    id_ = a.id or "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(12))
    if not ID_RE.match(id_):
        die("neplatne ID (povolene [a-z0-9]{8,32})")

    src16 = Path(a.video_16x9) if a.video_16x9 else None
    if src16 and not src16.is_file():
        die("zdrojove 16:9 video neexistuje: %s" % src16)

    stage = staging_root / id_
    stage.mkdir(parents=True, exist_ok=True)
    m = {
        "version": 1, "id": id_, "client": a.client, "title": a.title,
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "paid": False,
        "preview": {"file": "preview.mp4", "width": 1080, "height": 1920},
        "poster": "poster.jpg",
        "downloads": [],
    }
    stav, warning = None, None
    if a.reference and not a.set_price:
        ev = balik.evaluate(a.reference, id_)
        warning = ev["warning"]
        if ev["state"] == "ok":
            a.paid = True
        elif ev["state"] == "renewal" and not a.paid:
            r = dict(ev["renewal"], vat_rate=a.vat_rate, reference=ev["renewal"]["package_id"])
            r["single"] = {"net": a.single_price, "vat_rate": a.vat_rate, "reference": id_}
            iban = read_iban(a.iban_file)
            if iban:
                r["iban"] = iban
            m["renewal"] = r
            price = build_price(r["label"], r["net"], a.vat_rate, r["package_id"], a.iban_file)
        if price is None and ev["price"] and "renewal" not in m:
            price = build_price(ev["price"]["label"], ev["price"]["net"], a.vat_rate, a.reference, a.iban_file)
        stav = "odomknuté" if a.paid else "balík vyčerpaný" if "renewal" in m else "čaká na platbu"
    if price:
        m["price"] = price
    public = ["preview.mp4", "poster.jpg"]
    variants = [(src, PORTRAIT, "preview.mp4", "poster.jpg")]
    if src16:
        variants.append((src16, LANDSCAPE, "preview_16x9.mp4", "poster_16x9.jpg"))
        m["preview_16x9"] = {"file": "preview_16x9.mp4", "width": 1920, "height": 1080}
        m["poster_16x9"] = "poster_16x9.jpg"
        public += ["preview_16x9.mp4", "poster_16x9.jpg"]
    for vsrc, (w, h), pname, postername in variants:
        print("Kodujem nahlad %dx%d ..." % (w, h))
        encode_preview(vsrc, stage / pname, w, h)
        encode_poster(stage / pname, stage / postername, w, h)  # z náhľadu, aby aj obálka mala odznak
        print("Kodujem master %dx%d (pomale, preset slow) ..." % (w, h))
        mname = master_name(a.title, w, h)
        encode_master(vsrc, stage / mname, w, h)
        m["downloads"].append(download_entry(a.title, w, h, (stage / mname).stat().st_size))
    mf = stage / "manifest.json"
    write_manifest(mf, m)
    for name in public:
        t.put(id_, name, stage / name)
    if a.paid:
        m["paid"] = True
        publish_master(t, id_, m, stage)
        write_manifest(mf, m)
    t.put(id_, "manifest.json", mf)
    summary(id_, stage, m)
    if stav:
        try:
            balik.record_video(id_, a.client, a.reference, a.title, "9:16 + 16:9" if src16 else "9:16",
                               "%s?id=%s" % (BASE_URL, id_), stav, a.kling_credits)
        except Exception as e:
            warning = (warning + "; " if warning else "") + "zapis do Sheetu zlyhal (%s)" % e
    if warning:
        print("POZOR: %s" % warning)


if __name__ == "__main__":
    main()
