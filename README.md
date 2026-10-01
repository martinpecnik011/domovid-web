# Domovid web

Landing page Domovid pre realitných maklérov: https://martinpecnik011.github.io/domovid-web/

- `body.html`: zdroj stránky (rovnaký súbor sa publikuje aj ako Claude Artifact)
- `build.py`: z `body.html` zloží `index.html` s hlavičkou (SEO, OG náhľad, favicon). `python3 build.py <URL>` zároveň nastaví adresu formulára.
- `apps-script/`: backend formulára (Google Sheet + e-mail), návod v `apps-script/SETUP.md`
- `media/`: video pozadia (Kling, 720p) a ukážky z galérie
