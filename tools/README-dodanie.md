# Odovzdanie videa klientovi

Skript `tools/dodaj_video.py` pripraví zo zdrojového videa:

- `preview.mp4` – náhľad 1080×1920 v bežnej kvalite (H.264 CRF 23, AAC 128k, faststart) len s malým odznakom „DEMO · DOMOVID" v pravom hornom rohu (mimo spodného Reels UI),
- `poster.jpg` – snímka v 1. sekunde z náhľadu (má ten istý odznak),
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

Hneď odomknuté (publikuje aj master hneď): pridaj `--paid`. Vlastné ID: `--id abc12345xyz` (`[a-z0-9]{8,32}`);
predvolene sa vygeneruje 12 náhodných znakov (`secrets`), ID je zároveň „tajný" odkaz, preto ho nezdieľaj verejne.

Po prijatí platby na účet (nastaví aj `Videá!Q`):

```bash
python3 tools/dodaj_video.py --mark-paid ID --r2-bucket domovid-videa
```

Na konci skript vypíše odkaz pre klienta `https://martinpecnik011.github.io/domovid-web/video/?id=ID`,
veľkosť a bitrate mastera.

### Voliteľná 16:9 verzia

Pre to isté ID môžeš doručiť aj horizontálnu verziu: `--video-16x9 ~/Desktop/video_16x9.mp4`. Skript vyrobí navyše
`preview_16x9.mp4` (1920×1080, odznak), `poster_16x9.jpg` a master `<Nazov>_Domovid_1920x1080.mp4` (rovnaké
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

### IBAN v manifeste

Pri zadanej cene (vytvorenie s `--price-net` aj `--set-price`) skript načíta IBAN zo súboru
`~/.config/domovid/iban.txt` (inú cestu zadaj cez `--iban-file`) a zapíše ho do manifestu ako `price.iban`.
Súbor obsahuje IBAN v prvom neprázdnom riadku, napr. `SKxx xxxx xxxx xxxx xxxx xxxx` (medzery sa odstránia,
písmená sa zväčšia). Neplatný IBAN (formát alebo kontrolný súčet mod 97) skript zastaví skôr, než zapíše manifest.
Ak súbor chýba, `price.iban` sa nezapíše; pri `--set-price` sa existujúci `price.iban` zachová.
IBAN sa nikdy nevypisuje do výstupu (len „IBAN: áno/nie“) a do repozitára ho nedávaj.

### Kde ostáva master do zaplatenia

Master (a `manifest.json`) sa pri nezaplatenom videu **nenahráva**, ale ostáva v lokálnom staging priečinku
`<staging>/<id>/`. `--mark-paid` ho odtiaľ publikuje bez ďalšieho kódovania.

- `--out-dir DIR`: staging je `DIR/.master/<id>/`, verejný obsah je `DIR/<id>/`.
- `--r2-bucket`: staging je `~/.domovid-delivery/<id>/` (zmeníš cez `--staging-dir`).
- Ak master v staging chýba, `--mark-paid ID --source VIDEO` ho zakóduje znova zo zdroja.
- Staging priečinok nemaž, kým klient nezaplatí.

## Balíky (Google Sheet „Domovid – klienti a zisk“)

`tools/balik.py` číta/zapisuje Sheet (záložky `Klienti`, `Balíky`, `Videá`) cez `composio proxy` (toolkit `googledrive`,
účet `domovid-upload`). Vzorcové stĺpce (Balíky G, H, K; Videá I, K, L) sa nikdy nezapisujú.

Dodanie s referenciou balíka: `--reference HALO-2026-10` (bez `--price-net` sa popis a cena odvodia z balíka).

- Balík je zaplatený (`Zaplatené dňa`), má voľné miesto (počet videí s týmto `Balík ID`, bez práve dodávaného, je menej než
  `Videí v balíku`) a dnes je najneskôr `Koniec` → video sa odomkne hneď (ako `--paid`).
- Balík nie je zaplatený → video je zamknuté, cena z balíka (ako doteraz).
- Balík je zaplatený, ale vyčerpaný alebo po termíne → video je zamknuté a manifest dostane blok `renewal`
  (`package_id` ďalšieho balíka, napr. `HALO-2026-12` → `HALO-2027-01`, `previous_package_id`, `label`, `videos`, `net`,
  `vat_rate`, `reference`, `iban`, `reason`: `exhausted` | `expired`); `price` odkazuje na obnovu. Skript vypíše `POZOR`.
- Neznámy balík alebo nedostupný Sheet → video ostáva zamknuté a skript vypíše upozornenie (dodanie samotné prebehne).
- Každé dodanie s `--reference` pridá riadok do `Videá` (Stav: `odomknuté` / `čaká na platbu` / `balík vyčerpaný`);
  opakované dodanie s rovnakým Video ID len aktualizuje Stav. Voliteľne `--kling-credits N`.

Po prijatí platby za balík:

```bash
python3 tools/dodaj_video.py --package-paid HALO-2026-10 [--paid-date 2026-10-12] --r2-bucket domovid-videa
```

Zapíše len `Balíky!J` (ak je prázdne; `I` – Splatnosť – sa nemení), odomkne všetky videá balíka (rovnaká cesta ako `--mark-paid`; staging musí
existovať, rovnako ako pri `--out-dir`) a nastaví Stav `zaplatené – odomknuté`. Opakované spustenie nič nemení.

Platba obnovy: ak balík `PKG` v `Balíky` ešte nie je, ale nejaký odložený manifest ho ponúka v `renewal.package_id`,
skript najprv pridá riadok do `Balíky` (Začiatok = dátum platby, Koniec = dátum platby + 1 mesiac − 1 deň, cena a počet
videí z `renewal`, `Zaplatené dňa` = dátum platby; vzorcové stĺpce a Splatnosť ostávajú prázdne), presunie `Videá!C`
tohto videa na nový balík, odstráni z manifestu blok `renewal` (aj z publikovanej kópie) a video odomkne. Neznámy balík
bez zhodnej obnovy skončí chybou.

Na skúšku bez živého Sheetu: `DOMOVID_SHEET_FAKE=/cesta/fake.json` (vzor `tests/delivery/fixtures/sheet.json`).
Testy: `python3 -m unittest tests/delivery/test_balik.py -v`.

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

## Odomknutie: schválenie + balík / platba

Stiahnutie sa odomkne podľa **stavu v Sheete (cez Apps Script)**, nie podľa manifestu. Stránka pri načítaní volá
`GET <REVIEW_ENDPOINT>?type=status&id=ID` → `{ok, approved, unlocked, has_package, downloads[{label,url,bytes}]}`;
`downloads` prídu len keď `unlocked` (= schválené **a** nárok `Videá!Q = "áno"`). Pri chybe stavu zostane stránka zamknutá
(náhľad s odznakom, bez stiahnutia, s krátkou poznámkou).

| # | Stav | Prehrávač | Stiahnutie | Platobná výzva | Tlačidlá Schvaľujem / Chcem úpravu |
|---|------|-----------|------------|----------------|------------------------------------|
| 1 | bez balíka, neschválené | náhľad s odznakom | nie | áno (cena/IBAN) | áno |
| 2 | bez balíka, schválené, nezaplatené | náhľad s odznakom | nie | áno | nie (ani po reloade) |
| 3 | aktívny balík, neschválené | náhľad s odznakom | nie | nie | áno |
| 4 | aktívny balík, po schválení | čistý master (hneď, bez reloadu) | áno | nie | nie |
| 5 | bez balíka po `--mark-paid` / `--package-paid` (a schválení) | čistý master | áno | nie | nie |

Odznak zmizne presne vtedy, keď sa objaví tlačidlo na stiahnutie. Výzva na obnovu / „len toto video“ pri vyčerpanom balíku funguje ako doteraz.

- Master sa **nikdy nedáva do verejného manifestu**. Leží v `<id>/m-<token>/<subor>` (`token = secrets.token_urlsafe(24)`);
  token a zoznam súborov sú v staging `private.json` a v Sheete `Videá!O`, `P`.
- Master sa do bucketu nahrá pri dodaní **len ak balík pokrýva video** (`evaluate` = `ok`, alebo `--paid`); inak až pri
  `--mark-paid ID` / `--package-paid PKG`, ktoré zároveň nastavia `Q = "áno"`. Pri každom dodaní sa teraz zapisuje riadok do `Videá`
  aj bez `--reference` (balík prázdny), aby Apps Script poznal token a súbory.
- Manifest nesie `has_package` (len pomôcka na zobrazenie) a `paid` (pomôcka); stránka z nich nič neodomyká.

### Stĺpce `Videá` O–R (Apps Script)

| Stĺpec | Názov | Obsah |
|--------|-------|-------|
| O | Token | náhodný token cesty mastra |
| P | Súbory | JSON `[{"label","file","bytes"}]` |
| Q | Odomknuté | `áno` = nárok na stiahnutie (balík alebo platba); prázdne = nie |
| R | Schválené | ISO čas schválenia (píše Apps Script po `approve`); prázdne = neschválené |

`balik.py`: `record_video(..., token, files, unlocked)` zapisuje O–Q, `set_unlocked(video_id, token, files)` nastaví Q,
`is_approved(video_id)` číta R. Klient po schválení už nemôže poslať „Chcem úpravu“ (Apps Script vráti `{ok:false,error:"approved"}`).

## Platobný tok

1. Spusti skript bez `--paid` (s `--reference BALIK`, ak ho klient má) → klient dostane odkaz s náhľadom.
2. Pošli klientovi odkaz `…/video/?id=ID`; klient video schváli na stránke.
3. Bez balíka: pošli IBAN, po zaplatení `dodaj_video.py --mark-paid ID …` (alebo `--package-paid PKG`) → po schválení sa na stránke
   objaví stiahnutie a čistý master.

Ochrana pred zaplatením: v náhľade je len malý odznak „DEMO · DOMOVID"; prehrávač má `controlslist="nodownload noremoteplayback"`,
`disablepictureinpicture`, `draggable="false"` a zakázané kontextové menu.

Čestný limit: stránka je statická a R2 bucket verejný. Odhodlaný používateľ si môže náhľad (nie master) vytiahnuť cez devtools
(chráni ho odznak v obraze). Master je pred nárokom (balík/platba) v bucketi vôbec nenahratý. Po nároku je dostupný komukoľvek, kto pozná
jeho URL s tokenom (nehádateľná, ale verejná – odkaz `?id=` je tajný odkaz, kto ho má, môže schváliť aj stiahnuť po odomknutí).
Schválenie nie je overené identitou klienta. Skutočné odomknutie vyžaduje nasadený Apps Script (stav + `approve`).

### Prechod starých odovzdaní

1. Do živého Sheetu (`Videá`) pridaj hlavičky O–R: `Token`, `Súbory`, `Odomknuté`, `Schválené`.
2. Staré odovzdania (napr. Andreino `ch1c36yvcmlt`) treba `--mark-paid` (alebo nové dodanie), aby sa master presunul na cestu s tokenom; do
   tej doby živý manifest ešte vypisuje starý názov mastra.
3. Klienti, ktorí schválili v starom toku, majú `R` prázdne a musia schváliť znova.

Pozor: pri `--out-dir` je token v staging `private.json` pod `OUT/.master/`, preto `--out-dir` nikdy nesmie smerovať do obsluhovaného
priečinka. Bucket r2.dev nesmie byť listovateľný (žiadny listing Worker), inak by sa token dal vyčítať.

Testy: `python3 -B -m unittest discover -s tests/delivery` a e2e `tests/delivery/e2e.mjs` (fake R2 :8860, fake Apps Script :8861;
build s `PUBLIC_DELIVERY_BASE=http://localhost:8860 PUBLIC_REVIEW_ENDPOINT=http://localhost:8861/exec`, hlavička súboru).

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
  "has_package": false
}
```

- Manifest už **neobsahuje `downloads`** ani mená masterov; s `--video-16x9` pribudne `"preview_16x9"` a `"poster_16x9"`.
  Mastre (9:16, prípadne 1920×1080) sú v `private.json` a v Sheete (O, P).
- Voliteľné pole `price`: `{"label": "...", "net": 140.0, "vat_rate": 0.23, "reference": "HALO-2026-10"}` (net bez DPH),
  voliteľne aj `"iban"` (pozri vyššie).
- Voliteľné pole `renewal` (výzva na obnovu balíka, pozri „Balíky“): `{"package_id", "previous_package_id", "label", "videos", "net", "vat_rate", "reference", "iban", "reason", "single": {"net", "vat_rate", "reference"}}`; `single` je ponuka jedného videa (`--single-price`, predvolene 50 € bez DPH, `reference` = ID videa) namiesto obnovy balíka.
- Voliteľné pole `message` (text pre klienta) skript nezapisuje; môžeš ho doplniť do `manifest.json` ručne.
- Verejné súbory sú v bucketi pod `<id>/<file>`, mastre pod `<id>/m-<token>/<file>`; manifest sa nahráva ako posledný s `cache-control: no-store`.
