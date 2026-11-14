# Domovid app — nastavenie Supabase (návod pre Martina)

Ty robíš len prihlásenie a klikanie v prehliadači (OAuth, dashboard). Všetky príkazy spúšťa Claude.

## 1. Prehľad

Supabase je hotový backend: databáza (Postgres), prihlasovanie, úložisko súborov a realtime (správy sa zobrazia hneď). Všetko sa vytvorí migráciami z `supabase/migrations/`.

| Tabuľka / objekt | Na čo slúži |
|---|---|
| `profiles` | Jeden riadok na používateľa, stĺpec `role` = `customer` alebo `staff` |
| `conversations` | Jedna súkromná konverzácia na zákazníka (vytvorí sa automaticky triggerom po registrácii) |
| `messages` | Správy: `kind` = text, edit_request, link, file, system; `body`, `link_url`, `video_ref`, `timecode`, `read_by_staff_at`, `read_by_customer_at`. Realtime zapnutý |
| `attachments` | Prílohy k správam |
| bucket `chat` | Súkromné úložisko príloh (max 500 MB, obrázky, video, PDF) |
| `subscriptions` | Predplatné zákazníka (jedno na zákazníka): `plan` none/10/15/30/custom, `videos_included`/`videos_used`, obdobie, `commitment_until`, `payment_status` unpaid/paid/overdue, `price_net`. Jeden riadok na zákazníka a kategóriu (`category`), `addons` = mesačné doplnky |
| `content_items` | Mesačný obsahový plán zákazníka: `title`, `kind` (ponuka/osobna_znacka/tip/nabor/ine), `due_date`, `status` (planned/in_production/for_approval/approved/published) |
| `plans` | Cenník plánov (7 plánov v 3 kategóriách: social, video, video_viz), ceny bez DPH |
| `addons` | Doplnky (klon hlasu, digitálne dvojča, oba formáty, expres) |
| `public.export_messages` | Pohľad (view) na export správ do CSV, len pre staff |
| `public.is_staff()` | Pomocná funkcia, ktorú používajú pravidlá prístupu (RLS) |

Zákazník sa prihlási (6-ciferným kódom z e-mailu alebo cez Google) bez predplatného a vidí iba svoju konverzáciu. Staff (ty a tím) vidí všetky a zapisuje predplatné a obsahový plán; zákazník svoje len číta.

## 2. Vytvor projekt na supabase.com

1. Prihlás sa na https://supabase.com a zvoľ (alebo vytvor) organizáciu.
2. Klikni **New project**.
3. Name: `domovid-app`.
4. Region: **Central EU (Frankfurt) — eu-central-1**.
5. Database password: vygeneruj silné heslo a ulož ho do správcu hesiel. Nikdy ho nedávaj do chatu ani do repa.
6. Klikni **Create new project** a počkaj 1–2 minúty.

## 3. Migrácie

1. **Martin:** v termináli spusti `npx supabase login` (otvorí sa prehliadač, potvrď prihlásenie).
2. Project ref nájdeš v dashboarde: **Project Settings → General → Reference ID** (alebo v URL `https://<ref>.supabase.co`). Pošli ho Claudovi (nie je tajný).
3. **Claude** spustí:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   `link` si vypýta databázové heslo z kroku 2 — zadáš ho len do terminálu.
4. `db push` aplikuje všetky súbory z `supabase/migrations/` (tabuľky, RLS pravidlá, triggery, bucket `chat`, view).

Pozor: `supabase/seed.sql` je len na lokálne testovanie. Do ostrej databázy sa **nikdy** nenahráva. `db push` seed predvolene nespúšťa — nepoužívaj prepínač `--include-seed`.

## 4. Nastavenia prihlasovania (Auth)

1. **Authentication → URL Configuration**:
   - Site URL: `https://domovid.sk/app/`
   - Redirect URLs (pridaj všetky):
     - `http://localhost:4321/app/`
     - `https://domovid.sk/app/`
2. **Authentication → Providers → Email**: zapni (prihlásenie jednorazovým kódom; heslo netreba). Nastav **OTP length = 6** a **OTP expiry = 600 s** (10 minút). Lokálne to nastaví `supabase/config.toml`; v cloude to nastav v dashboarde (odporúčané, vizuálne skontroluj) alebo cez `npx supabase config push` (spustí Claude).
3. **Google provider:**
   1. Choď na https://console.cloud.google.com → vyber/vytvor projekt → **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   2. Application type: **Web application**.
   3. Authorized redirect URI: `https://<ref>.supabase.co/auth/v1/callback`.
   4. Skopíruj Client ID a Client secret.
   5. V Supabase: **Authentication → Providers → Google** → zapni a vlož Client ID a Secret. Secret patrí len do Supabase dashboardu, nie do repa ani chatu.
   6. Ak Google vyžiada OAuth consent screen, vyplň názov appky "Domovid" a svoj e-mail.

## 5. E-mailové šablóny (6-ciferný kód) po slovensky

Prihlásenie používa kód, nie klikací odkaz — odkaz môže zákazník preposlať alebo ho otvorí e-mailový skener a odkaz sa spotrebuje. Preto sa v šablónach zámerne nepoužíva `{{ .ConfirmationURL }}`; zobrazuje sa kód `{{ .Token }}`.

1. **Authentication → Email Templates → Magic Link**: Subject `Váš prihlasovací kód – Domovid`, Body vlož z `supabase/templates/magic_link.html`.
2. **Confirm signup**: Subject rovnaký, Body vlož z `supabase/templates/confirmation.html`.
3. Šablóny používajú farby Domovid: navy `#14232F`, zlatá `#E0AD55`.

Lokálne ich načíta `supabase/config.toml`; v cloude ich treba vložiť ručne (alebo `npx supabase config push`).

## 6. Pridanie staff člena

1. Človek sa najprv raz prihlási do appky (tým sa vytvorí jeho `profiles` riadok).
2. V Supabase: **SQL Editor** → spusti (nahraď e-mail):
   ```sql
   update public.profiles set role = 'staff' where email = 'meno@example.com';
   ```
3. Odobratie práv:
   ```sql
   update public.profiles set role = 'customer' where email = 'meno@example.com';
   ```
4. Povýšenie na staff **a** zapnuté MFA (sekcia 7) sú potrebné oba — samotná rola nestačí.
5. Zákazník si rolu nemôže zmeniť sám — bráni tomu RLS pravidlo aj trigger. Rolu meníš len ty v SQL Editore (alebo Claude cez príkaz). Zákazník nemôže meniť ani svoj e-mail (len staff); meno, telefón a firmu si upraviť môže.

## 7. Dvojfaktorové overenie (MFA) pre staff

`public.is_staff()` je pravda len pre `role = 'staff'` **a** prihlásenie s MFA (JWT `aal2`). Funkcia `public.is_staff_role()` hovorí appke, že staff musí MFA dokončiť.

1. V dashboarde **Authentication → Multi-Factor** over, že TOTP je zapnuté.
2. Po povýšení (sekcia 6) sa staff prihlási do appky a pridá TOTP v Google Authenticator alebo 1Password (naskenuje QR kód, zadá 6-ciferný kód).
3. Kým MFA nedokončí (aal1), vidí a môže len to, čo zákazník.

## 8. Predplatné a obsahový plán

Zapisuje len staff (po MFA) v **SQL Editor**; zákazník svoje údaje len číta.

### Cenník (katalóg)

Ceny sú **bez DPH** a žijú v databáze (tabuľky `plans` a `addons`). Zmena cez SQL Editor, napr. `update public.plans set price_net = 300 where code = '10';`.

| Kód | Názov | Cena | Jednotka | Kategória |
|---|---|---|---|---|
| `10` | 10 videí (29 €/video) | 290 € | mesiac | social |
| `15` | 15 videí (26 €/video, najobľúbenejší) | 390 € | mesiac | social |
| `30` | 30 videí (23 €/video) | 690 € | mesiac | social |
| `video_1` | Video z fotiek, jednorazovo | 50 € | jednorazovo | video |
| `video_4` | Video z fotiek, 4 nehnuteľnosti (35 €/video, populárny) | 140 € | mesiac | video |
| `viz_1` | Video s vizualizáciou, jednorazovo | 62 € | jednorazovo | video_viz |
| `viz_4` | Video s vizualizáciou, 4 mesačne (50 €/video) | 200 € | mesiac | video_viz |
| `voice_clone` | Klon hlasu (doplnok) | 40 € | mesiac | social |
| `digital_twin` | Digitálne dvojča, hlas + avatar (obsahuje klon hlasu) | 110 € | mesiac | social |
| `both_formats` | Oba formáty 9:16 + 16:9 (doplnok) | +10 € | video | video |
| `express` | Expres do 12 h (doplnok) | +15 € | video | video |

Social plány majú viazanosť 3 mesiace; video plány bez viazanosti. Pri vizualizáciách max. 5 na nehnuteľnosť.

Doplnky `both_formats` a `express` sa objednávajú pri konkrétnom videu v chate / žiadosti o úpravu, na predplatnom sa neukladajú. Na predplatnom (`addons`) sú len mesačné `voice_clone` a `digital_twin`, a to iba na social riadku.

### Úprava predplatného

```sql
update public.subscriptions
set plan = '15', videos_included = 15, addons = '{voice_clone}', payment_status = 'paid',
    period_start = '2026-12-01', period_end = '2026-12-31',
    commitment_until = '2027-02-28'
where customer_id = (select id from public.profiles where email = 'zakaznik@example.com')
  and category = 'social';
```

Pridanie ďalšieho riadku (iná kategória):

```sql
insert into public.subscriptions (customer_id, category, plan, videos_included, payment_status)
values ((select id from public.profiles where email = 'zakaznik@example.com'),
        'video_viz', 'viz_4', 4, 'unpaid');
```

Po registrácii sa automaticky vytvorí jeden social riadok s `plan = 'none'`. Plán musí existovať v `plans` v rovnakej kategórii (alebo `none` / `custom`) — kontroluje trigger.

### Obsahový plán

```sql
insert into public.content_items (customer_id, title, kind, due_date, status)
values ((select id from public.profiles where email = 'zakaznik@example.com'),
        'Video: ponuka bytu Bratislava', 'ponuka', '2026-12-10', 'planned');
```

(Presné názvy stĺpcov over v `supabase/migrations/`.)

## 9. Bezpečnosť

- **Limity:** `supabase/config.toml` má `email_sent` 30/h a `token_verifications` 30 za 5 min na IP. V cloude ich skontroluj v **Authentication → Rate Limits**.
- **Vlastné SMTP (pred ostrým spustením):** predvolené SMTP od Supabase má len pár e-mailov za hodinu. Nastav **Authentication → SMTP Settings** (Resend alebo Brevo) s odosielateľom na doméne Domovidu.
- **Captcha (neskôr):** je pripravená, ale vypnutá. Vytvor Cloudflare Turnstile widget (Cloudflare → Turnstile), v Supabase **Authentication → Attack Protection** zapni captcha, vlož Secret key (len do dashboardu) a Claude doplní Site key do frontendu.
- **Časový limit relácie / neaktivita:** je to platená funkcia Supabase (Pro), v `config.toml` je zakomentovaná.

## 10. Kľúče

V **Project Settings → API** (alebo API Keys) sú dva druhy kľúčov:

- **Project URL** a **anon / publishable key** idú do frontendu, napr. ako `PUBLIC_SUPABASE_URL` a `PUBLIC_SUPABASE_ANON_KEY`. Sú verejné zámerne — dáta chránia RLS pravidlá.
- **service_role / secret key** obchádza všetky pravidlá. **Nikdy** ho nedávaj do frontendu, repa ani chatu. Appka ho nepotrebuje.

## 11. Úložisko (Storage)

Bucket `chat` vytvorí migrácia. Over v **Storage**: existuje `chat`, je **Private**, limit 500 MB.

Cesta súboru: `<conversation_id>/<message_id>/<filename>`. Povolené typy: `image/*`, `video/*`, `application/pdf`. Prístup majú len účastníci danej konverzácie a staff.

## 12. Export do CSV

V **SQL Editor** spusti:

```sql
select * from public.export_messages;
```

Potom v paneli výsledkov **Download CSV**. Cez API to funguje len pre prihláseného staff používateľa (view je pre zákazníkov zamknutý).

## 13. Lokálny vývoj a testy (voliteľné)

1. Nainštaluj a spusti Docker Desktop.
2. `npx supabase start` — spustí lokálnu Supabase.
3. `npx supabase db reset` — aplikuje migrácie a nahrá `supabase/seed.sql` (testovacie dáta, iba lokálne).
4. Testy pravidiel prístupu (RLS) bežia ako Node skript `supabase/tests/rls.test.mjs` na pglite (Postgres v Node, bez Dockeru). pglite sa do repa zámerne nepridáva, preto ho nainštaluj mimo repa:
   ```bash
   mkdir -p ~/tmp/pglite && cd ~/tmp/pglite && npm init -y && npm install @electric-sql/pglite
   ```
   Potom z koreňa repa:
   ```bash
   PGLITE_DIR=~/tmp/pglite node supabase/tests/rls.test.mjs
   ```
   Očakávaj `ALL ASSERTIONS PASSED` a exit kód 0. Lokálne za Supabase auth/storage zastupujú náhrady (stubs) v `supabase/tests/_stubs.sql`. Voliteľne `FORCE_FAIL=1` pred príkazom dokáže, že test hlasno zlyhá (exit kód nenulový).
5. `npx supabase stop` na vypnutie.

## 14. Kontrolný zoznam

- [ ] Projekt `domovid-app` vytvorený v regióne eu-central-1 (Frankfurt)
- [ ] DB heslo uložené v správcovi hesiel (nie v chate ani repe)
- [ ] `npx supabase login` hotový (Martin)
- [ ] `supabase link` + `supabase db push` prebehli bez chyby (Claude)
- [ ] Seed sa na ostrú databázu nenahral
- [ ] Site URL a Redirect URLs nastavené
- [ ] Email provider zapnutý, OTP length 6 a expiry 600 s nastavené
- [ ] Šablóny Magic Link a Confirm signup (kód `{{ .Token }}`) vložené
- [ ] Google provider nastavený (secret len v Supabase)
- [ ] Martin je `staff` (SQL v kroku 6) po prvom prihlásení
- [ ] MFA (TOTP) zapnuté a staff ho pridal
- [ ] Cenník skontrolovaný v tabuľkách `plans` / `addons`
- [ ] `select * from public.subscriptions` a `public.plans` vrátia dáta (staff s MFA)
- [ ] Bucket `chat` je súkromný, limit 500 MB
- [ ] Do frontendu idú len Project URL a anon key; service_role nikde
- [ ] `select * from public.export_messages` vráti správy (ako staff)
- [ ] Vlastné SMTP naplánované pred ostrým spustením
