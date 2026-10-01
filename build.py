"""Build index.html (GitHub Pages) from body.html (also the Claude Artifact source).
Usage: python3 build.py [FORM_ENDPOINT_URL]"""
import re, sys, pathlib

root = pathlib.Path(__file__).parent
body = (root / "body.html").read_text()
endpoint = sys.argv[1] if len(sys.argv) > 1 else ""
if endpoint:
    body = re.sub(r"var FORM_ENDPOINT = '[^']*'; // DOMOVID_FORM_ENDPOINT",
                  f"var FORM_ENDPOINT = '{endpoint}'; // DOMOVID_FORM_ENDPOINT", body)
    (root / "body.html").write_text(body)
body = re.sub(r"^<title>.*?</title>\n", "", body)

site = "https://martinpecnik011.github.io/domovid-web/"
desc = "Z fotiek nehnuteľnosti urobíme video pre Instagram aj inzerát do 24 hodín. Pre realitných maklérov."
favicon = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E"
           "%3Crect width='64' height='64' rx='14' fill='%23142330'/%3E"
           "%3Cpath d='M14 34 32 18l18 16v14H14z' fill='none' stroke='%23e0ad55' stroke-width='5' stroke-linejoin='round'/%3E"
           "%3Cpath d='M28 48V38h8v10' fill='%23e0ad55'/%3E%3C/svg%3E")
head = f"""<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Domovid – video pre realitných maklérov</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:locale" content="sk_SK">
<meta property="og:title" content="Domovid – z fotiek video, ktoré predáva">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{site}">
<meta property="og:image" content="{site}media/bg-vila.jpg">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="720">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f3f7fa">
<link rel="icon" href="{favicon}">
<link rel="canonical" href="{site}">
</head>
<body>
"""
(root / "index.html").write_text(head + body + "\n</body>\n</html>\n")
print("index.html built", "with endpoint" if endpoint else "without endpoint")
