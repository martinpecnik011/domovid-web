# Odovzdanie videa klientovi

Skript `tools/dodaj_video.py` pripraví zo zdrojového videa:

- `preview.mp4` – náhľad 1080×1920 s vodoznakom „NÁHĽAD · DOMOVID" (H.264 CRF 23, AAC 128k, faststart),
- `poster.jpg` – snímka v 1. sekunde,
- master `<Nazov>_Domovid_1080x1920.mp4` – plná kvalita (CRF 12, preset slow, ~18–20 Mb/s, max 30 Mb/s, AAC 320k),
- `manifest.json` – popis, ktorý číta stránka `/video/?id=ID`.

Potrebuje len Python 3 a ffmpeg/ffprobe z `/opt/homebrew/bin` (s `drawtext`). Zdrojové video sa nikdy nemení.

## Použitie

Nový klient, ešte nezaplatené (publikuje sa len náhľad, poster a manifest s `paid: false`):

```bash
python3 tools/dodaj_video.py ~/Desktop/video.mp4 --client "Meno Klienta" --title "Rodinný dom Záhorská" \
  --r2-bucket domovid-videa
```

Rovnaké do lokálneho priečinka (na skúšku, bez Cloudflare):

```bash
python3 tools/dodaj_video.py ~/Desktop/video.mp4 --client "Meno" --title "Názov" --out-dir /cesta/delivery
```

Hneď zaplatené (publikuje aj master): pridaj `--paid`. Vlastné ID: `--id abc12345xyz` (`[a-z0-9]{8,32}`);
predvolene sa vygeneruje 12 náhodných znakov (`secrets`), ID je zároveň „tajný" odkaz, preto ho nezdieľaj verejne.

Po prijatí platby na účet:

```bash
python3 tools/dodaj_video.py --mark-paid ID --r2-bucket domovid-videa
```

Na konci skript vypíše odkaz pre klienta `https://martinpecnik011.github.io/domovid-web/video/?id=ID`,
veľkosť a bitrate mastera.

### Voliteľná 16:9 verzia

Pre to isté ID môžeš doručiť aj horizontálnu verziu: `--video-16x9 ~/Desktop/video_16x9.mp4`. Skript vyrobí navyše
`preview_16x9.mp4` (1920×1080, vodoznak), `poster_16x9.jpg` a master `<Nazov>_Domovid_1920x1080.mp4` (rovnaké
nastavenie ako 9:16) a do `manifest.json` pridá `preview_16x9`, `poster_16x9` a druhú položku v `downloads`.
Bez `--video-16x9` je výstup rovnaký ako doteraz. Pri `--mark-paid` sa publikujú všetky mastre; ak 16:9 master
v staging chýba, pridaj `--source-16x9 VIDEO` (9:16 master doplní `--source`).

### Cena v manifeste

Voliteľne zapíš cenu, ktorú stránka ukáže klientovi: `--price-net 140 --price-label "Mesačný balík" --reference HALO-2026-10`
(`--price-net` je suma bez DPH, DPH sa berie z `--vat-rate`, predvolene `0.23`). Všetky tri argumenty idú spolu;
bez `--price-net` pole `price` v manifeste nie je.

Cenu môžeš doplniť aj dodatočne, bez prekódovania a bez nahrávania videí:

```bash
python3 tools/dodaj_video.py --set-price ID --price-net 140 --price-label "Mesačný balík" \
  --reference HALO-2026-10 --r2-bucket domovid-videa
```

Prepíše sa len `manifest.json` (pri `--out-dir` aj v `.master/<id>/`, pri R2 sa stiahne, upraví a nahrá späť;
staging kópia sa upraví tiež, aby ju `--mark-paid` nezahodil).

### Kde ostáva master do zaplatenia

Master (a `manifest.json`) sa pri nezaplatenom videu **nenahráva**, ale ostáva v lokálnom staging priečinku
`<staging>/<id>/`. `--mark-paid` ho odtiaľ publikuje bez ďalšieho kódovania.

- `--out-dir DIR`: staging je `DIR/.master/<id>/`, verejný obsah je `DIR/<id>/`.
- `--r2-bucket`: staging je `~/.domovid-delivery/<id>/` (zmeníš cez `--staging-dir`).
- Ak master v staging chýba, `--mark-paid ID --source VIDEO` ho zakóduje znova zo zdroja.
- Staging priečinok nemaž, kým klient nezaplatí.

## Jednorazové nastavenie Cloudflare R2

1. `npx wrangler login` (otvorí OAuth v prehliadači).
2. `npx wrangler r2 bucket create domovid-videa`
3. V Cloudflare dashboarde: R2 → `domovid-videa` → Settings → **Public Development URL** → Enable.
   Dostaneš adresu `https://pub-xxxxxxxx.r2.dev`.
4. CORS – súbor `cors.json`:

   ```json
   {
     "rules": [
       {
         "allowed": {
           "origins": ["https://martinpecnik011.github.io", "http://localhost:4321"],
           "methods": ["GET", "HEAD"],
           "headers": ["*"]
         },
         "maxAgeSeconds": 3600
       }
     ]
   }
   ```

   Nastav ho: `npx wrangler r2 bucket cors set domovid-videa --file cors.json`
   (kontrola: `npx wrangler r2 bucket cors list domovid-videa`).
5. Nastav adresu v webe: premenná `PUBLIC_DELIVERY_BASE=https://pub-xxxxxxxx.r2.dev` pri builde
   (GitHub Actions variable / `.env`), alebo prepíš predvolenú hodnotu v `src/config/delivery.ts`.

Poznámka: r2.dev adresa je určená na vývoj a má limity; pre ostrú prevádzku je lepšia vlastná doména na bucket.

## Platobný tok

1. Spusti skript bez `--paid` → klient dostane len odkaz s náhľadom.
2. Pošli klientovi odkaz `…/video/?id=ID`.
3. Klient náhľad schváli (formulár na stránke).
4. Pošli klientovi IBAN, sumu a ako variabilný symbol ID videa.
5. Po zaplatení: `dodaj_video.py --mark-paid ID …` → na stránke sa odomknú sťahovania.

Upozornenie: `paid: false` zamyká len stránku. Master sa pred zaplatením do bucketu vôbec nenahrá, takže ho
nikto nemôže stiahnuť podľa uhádnutej URL.

## Schéma `manifest.json`

```json
{
  "version": 1,
  "id": "p65qnzy8cjsr",
  "client": "Test Klient",
  "title": "Rodinný dom Záhorská",
  "created": "2026-10-26T16:06:43Z",
  "paid": false,
  "preview": { "file": "preview.mp4", "width": 1080, "height": 1920 },
  "poster": "poster.jpg",
  "downloads": [
    { "label": "Originál – plná kvalita (1080×1920)", "file": "RodinnyDomZahorska_Domovid_1080x1920.mp4", "bytes": 33364557 }
  ]
}
```

- `downloads` má jedinú položku – 9:16 master; s `--video-16x9` pribudne druhá (1920×1080) a v manifeste aj
  `"preview_16x9": { "file": "preview_16x9.mp4", "width": 1920, "height": 1080 }` a `"poster_16x9": "poster_16x9.jpg"`.
- `downloads` sa zapisuje vždy (aj pri `paid: false`), súbory z neho sú v bucketi len po zaplatení.
- Voliteľné pole `price`: `{"label": "...", "net": 140.0, "vat_rate": 0.23, "reference": "HALO-2026-10"}` (net bez DPH).
- Voliteľné pole `message` (text pre klienta) skript nezapisuje; môžeš ho doplniť do `manifest.json` ručne.
- Súbory sú v bucketi pod `<id>/<file>`; manifest sa nahráva ako posledný s `cache-control: no-store`.
