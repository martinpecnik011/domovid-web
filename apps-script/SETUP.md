# Pripojenie formulára (Google Sheet + e-mail)

Jednorazovo, asi 3 minúty. Robí sa v tvojom Google účte (martinpecnik011@gmail.com).

1. Otvor https://sheets.new a tabuľku pomenuj **Domovid leady**.
2. V tabuľke klikni **Rozšírenia → Apps Script**.
3. Zmaž obsah súboru `Code.gs` a vlož celý obsah súboru `apps-script/Code.gs` z tohto repa. Ulož (Cmd+S).
4. Hore vyber funkciu **setup** a klikni **Spustiť**. Google sa spýta na povolenia: daj **Povoliť** (pri „Google tuto aplikaci neověřil“ klikni *Rozšířené → Přejít na…*, je to tvoj vlastný skript).
   V tabuľke sa objaví hárok **Leady** s hlavičkou.
5. Klikni **Nasadiť → Nové nasadenie** → ozubené koliesko → **Webová aplikácia**.
   - Spustiť ako: **Ja**
   - Kto má prístup: **Ktokoľvek**
   Klikni **Nasadiť** a skopíruj **URL webovej aplikácie** (končí na `/exec`).
6. URL vlož do webu: `python3 build.py <URL>` a pushni (aktuálne nasadené: Domovid leady backend, verzia 1).

Každý dopyt potom pribudne ako nový riadok v hárku **Leady** a príde ti e-mail s odkazom na WhatsApp daného makléra.

Stĺpce hárku **Leady** (16): Prijaté, Meno, Telefón, E-mail, Správa, Stránka, Odoslané (prehliadač), Fotky, UTM, Zľavový kód, Typ, Lokalita, Cena, Plocha m², Ako má video vyzerať, Referenčné video. Stĺpec Správa sa plní len zo starého formulára v cache prehliadača, nový formulár ho nepošle.

**Keď upravíš Code.gs:** Nasadiť → Spravovať nasadenia → ceruzka → Verzia: *Nová verzia* → Nasadiť. URL ostáva rovnaká.

## Aktualizácia na verziu s fotkami

Nová verzia `Code.gs` prijme k dopytu až 10 fotiek a uloží ich do tvojho Google Drive. Staré dopyty bez fotiek fungujú ďalej. Jednorazovo, asi 2 minúty:

1. V tabuľke **Domovid leady** otvor **Rozšírenia → Apps Script**.
2. Zmaž obsah `Code.gs`, vlož celý nový obsah súboru `apps-script/Code.gs` z tohto repa a ulož (Cmd+S).
3. Hore vyber funkciu **setup** a klikni **Spustiť**. Google sa spýta na nové povolenie pre **Google Drive** — daj **Povoliť** (pri „Google tuto aplikaci neověřil“ opäť *Rozšířené → Přejít na…*).
4. **Nasadiť → Spravovať nasadenia → ceruzka → Verzia: *Nová verzia* → Nasadiť.** URL webovej aplikácie ostáva rovnaká, na webe netreba nič meniť.

Čo sa zmení:

- Hárok **Leady** dostane na konci dva nové stĺpce: **Fotky** (odkaz na priečinok s fotkami daného dopytu, prázdne ak fotky neprišli) a **UTM** (odkiaľ návštevník prišiel). Existujúce riadky ostanú bez zmeny.
- Fotky sa ukladajú do priečinka **Domovid leady – fotky** v koreni tvojho Google Drive; každý dopyt má vlastný podpriečinok `RRRR-MM-DD HH:MM – Meno`. Priečinky nie sú verejne zdieľané — otvoríš ich len pod svojím účtom.
- V e-maile o novom dopyte pribudne riadok **Fotky: N – odkaz** (a **Preskočené súbory: K**, ak niektorý súbor nebol obrázok, bol väčší ako 8 MB alebo ich bolo viac ako 10).
- Ak zákazník poslal fotky, potvrdzujúci e-mail mu napíše, že sme ich prijali, namiesto výzvy poslať ich na WhatsApp.
- Ak priečinok **Domovid leady – fotky** zmažeš, pri ďalšom dopyte s fotkami sa vytvorí znova.

## Schvaľovanie videí klientmi

Rovnaký endpoint (`/exec` URL) prijíma aj odpoveď klienta na hotové video. Stránka s videom pošle JSON s `type: "review"`, ID videa (malé písmená a číslice, 8–32 znakov), akciou `approve` (schválené) alebo `changes` (chcem úpravu, pripomienky sú povinné), menom klienta, názvom videa a stránkou.

Čo sa stane:

- Odpoveď sa zapíše ako nový riadok do hárku **Schválenia** (stĺpce: Prijaté, ID videa, Klient, Video, Akcia, Pripomienky, Stránka, Odoslané). Hárok sa vytvorí sám pri prvej odpovedi, nič netreba robiť ručne.
- Tebe príde e-mail s predmetom „Domovid: klient schválil video – meno“ alebo „Domovid: klient chce úpravu – meno“, s pripomienkami a odkazom na tabuľku. Klientovi sa nič neposiela.
- Neplatné ID, neznáma akcia alebo úprava bez pripomienok sa zahodia bez zápisu a bez e-mailu. Dopyty z formulára fungujú ďalej bez zmeny.

Nasadenie novej verzie (URL ostáva rovnaká, na webe nič nemeníš):

1. V tabuľke **Domovid leady** otvor **Rozšírenia → Apps Script**.
2. Zmaž obsah `Code.gs`, vlož celý nový obsah súboru `apps-script/Code.gs` z tohto repa a ulož (Cmd+S).
3. **Nasadiť → Spravovať nasadenia → ceruzka → Verzia: *Nová verzia* → Nasadiť.**

## Upozornenie na vyčerpaný balík

Keď existujúci klient (e-mail z formulára sa zhoduje s e-mailom v hárku **Klienti**) pošle dopyt a jeho posledný mesačný balík je zaplatený a vyčerpaný (počet videí v hárku **Videá** dosiahol počet v balíku) alebo už uplynul jeho koniec, fotky sa uložia ako vždy, no odpoveď obsahuje `warning`. Upozornenie sa zobrazí vo formulári, pridá sa do potvrdzujúceho e-mailu klientovi a do e-mailu tebe (s menom klienta a ID balíka). Ak kontrola zlyhá alebo nie je nastavená, dopyt sa spracuje bez upozornenia.

Hárky Klienti / Balíky / Videá sú v inej tabuľke než Leady, preto jednorazovo:

1. V Apps Script otvor **Nastavenia projektu → Vlastnosti skriptu → Pridať vlastnosť**: `KLIENTI_SHEET_ID` = `1Zrc_k0x3GuTlQxI9XwfX3K8IT1M_3lyli8OFaCPo1Mo`.
2. Skript musí mať prístup k tej tabuľke (otvor ju pod rovnakým Google účtom, ktorému skript patrí, alebo ju zdieľaj naň). Pri ďalšom spustení Google môže vypýtať povolenie pre Tabuľky — daj **Povoliť**.
3. Vlož nový `Code.gs` a **Nasadiť → Spravovať nasadenia → ceruzka → Verzia: *Nová verzia* → Nasadiť.**

Formulár na webe už neposiela požiadavku v režime `no-cors`, aby si vedel prečítať odpoveď; Apps Script na takú požiadavku odpovedá aj pre iný pôvod.

## Odomykanie stiahnutia (stav videa, schválenie)

Server strana modelu odomykania. Zdieľaný záznam je hárok **Videá** v tabuľke Klienti (`KLIENTI_SHEET_ID`); riadok sa hľadá podľa stĺpca D (ID videa). K existujúcim stĺpcom pribudli vpravo (hlavička v riadku 1):

- **O Token** – tajná časť verejnej adresy masteru,
- **P Súbory** – JSON pole `[{"label":"Stiahnuť v plnej kvalite (1080×1920)","file":"Nazov_Domovid_1080x1920.mp4","bytes":123}]`,
- **Q Odomknuté** – `áno` alebo prázdne (píše `dodaj_video.py` pri `--mark-paid` / `--package-paid`, pri balíku aj schválenie),
- **R Schválené** – ISO čas schválenia klientom alebo prázdne.

Vzorce v I, K, L skript nikdy nepíše.

Nová vlastnosť skriptu (voliteľná): `R2_PUBLIC_BASE` = verejná adresa R2 bucketu bez lomky na konci (predvolene `https://pub-bc98670f5e3646368728e7feaba801a7.r2.dev`). Odkaz na master je `R2_PUBLIC_BASE/ID/m-TOKEN/SÚBOR`.

Endpointy (rovnaká `/exec` URL):

- `GET ?type=status&id=ID` vráti `{"ok":true,"approved":bool,"unlocked":bool,"has_package":bool,"downloads":[{"label","url","bytes"}]}`. `downloads` je neprázdne len keď je video odomknuté. Neznáme alebo neplatné ID vráti `{"ok":false}`. Bez `type=status` ostáva zdravotná odpoveď ako predtým.
- `POST` s `type: "review"`, `action: "approve"` zapíše riadok do Schválenia a pošle e-mail ako doteraz (zlyhanie e-mailu odpoveď nezmení), naviac nastaví **Schválené** (len ak je prázdne, opakované schválenie nič nemení). Skript **nikdy nezapisuje Odomknuté**. Odpoveď má tvar statusu (`approved: true`); ak stav videa nie je dostupný, vráti `{"ok":false,"error":"not_found"}` (neznáme ID) alebo `{"ok":false,"error":"state"}` (chýba `KLIENTI_SHEET_ID` alebo hárok Videá), riadok a e-mail sa zapíšu aj tak.
- **Stiahnutie sa zobrazí len keď je video schválené (R) A zároveň Q = `áno`.** Q zapisuje `dodaj_video.py` v momente nahratia masteru: pri doručení klientovi s aktívnym balíkom, inak pri `--mark-paid` / `--package-paid`. `has_package` (balík zaplatený, dnes ≤ koniec, počet videí ≤ počet v balíku) je len informácia; ak hárok Balíky chýba, je `false`.
- `action: "changes"` po schválení vráti `{"ok":false,"error":"approved"}`. `renew`, `decline`, `single` sa nezmenili.

Stránka posiela POST s `Content-Type: text/plain` (bez `no-cors`) a číta odpoveď. Apps Script odpovedá na POST presmerovaním 302 na googleusercontent; `fetch` ho nasleduje ako GET a dostane telo z ContentService s povoleným CORS.

Nasadenie: **je potrebná NOVÁ verzia nasadenia Apps Scriptu** (vlož nový `Code.gs`, potom **Nasadiť → Spravovať nasadenia → ceruzka → Verzia: *Nová verzia* → Nasadiť**). URL ostáva rovnaká.
