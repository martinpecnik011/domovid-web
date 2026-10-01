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

**Keď upravíš Code.gs:** Nasadiť → Spravovať nasadenia → ceruzka → Verzia: *Nová verzia* → Nasadiť. URL ostáva rovnaká.
