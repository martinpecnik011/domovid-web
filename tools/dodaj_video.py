#!/usr/bin/env python3
"""Domovid - odovzdanie hotoveho videa klientovi (nahlad s vodoznakom + master po zaplateni).

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
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

os.environ["PATH"] = "/opt/homebrew/bin:" + os.environ.get("PATH", "")

BASE_URL = "https://martinpecnik011.github.io/domovid-web/video/"
WATERMARK = "NÁHĽAD · DOMOVID"
FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
ID_RE = re.compile(r"^[a-z0-9]{8,32}$")
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


def watermark_filter(w, h):
    font = dt_escape(find_font())
    text = dt_escape(WATERMARK)
    big = 84 if h > w else 64
    parts = [scale(w, h)]
    for y in ("h*0.22", "h*0.50", "h*0.78"):
        parts.append("drawtext=fontfile='%s':text='%s':fontsize=%d:fontcolor=white@0.35:"
                     "shadowcolor=black@0.25:shadowx=2:shadowy=2:x=(w-text_w)/2:y=%s-text_h/2" % (font, text, big, y))
    parts.append("drawtext=fontfile='%s':text='%s':fontsize=36:fontcolor=white@0.8:"
                 "box=1:boxcolor=black@0.35:boxborderw=12:x=40:y=60" % (font, text))
    return ",".join(parts)


def encode_preview(src, dst, w, h):
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(src), "-vf", watermark_filter(w, h),
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
    return {"label": "Originál – plná kvalita (%d×%d)" % (w, h), "file": master_name(title, w, h), "bytes": master_bytes}


def write_manifest(path, m):
    path.write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# ---- publikovanie (local / R2) ----
CTYPES = {".mp4": "video/mp4", ".jpg": "image/jpeg", ".json": "application/json"}


class Target:
    def __init__(self, out_dir, bucket):
        self.out_dir, self.bucket = out_dir, bucket

    def put(self, id_, name, path):
        if self.out_dir:
            dest = Path(self.out_dir) / id_
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, dest / name)
            return
        cmd = ["npx", "wrangler", "r2", "object", "put", "%s/%s/%s" % (self.bucket, id_, name),
               "--file", str(path), "--remote", "--content-type", CTYPES[Path(name).suffix]]
        if name == "manifest.json":
            cmd += ["--cache-control", "no-store"]
        run(cmd)
        print("  nahrane: %s/%s" % (id_, name))


def publish_master(t, id_, m, stage):
    for d in m["downloads"]:
        t.put(id_, d["file"], stage / d["file"])


def summary(id_, stage, m):
    print("\nID: %s" % id_)
    for d in m["downloads"]:
        mb = d["bytes"] / 1e6
        dur = probe_duration(stage / d["file"])
        print("Master: %s  %.1f MB  %.1f Mb/s" % (d["file"], mb, d["bytes"] * 8 / dur / 1e6))
    print("Stav: %s" % ("ZAPLATENE (master publikovany)" if m["paid"] else "NEZAPLATENE (iba nahlad)"))
    print("Odkaz pre klienta: %s?id=%s" % (BASE_URL, id_))


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

    if a.mark_paid:
        id_ = a.mark_paid
        if not ID_RE.match(id_):
            die("neplatne ID (povolene [a-z0-9]{8,32})")
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
        summary(id_, stage, m)
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
        encode_poster(stage / pname, stage / postername, w, h)  # z náhľadu, aby aj obálka mala vodoznak
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


if __name__ == "__main__":
    main()
