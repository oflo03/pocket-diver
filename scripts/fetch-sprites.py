# Downloads the static PokeAPI front sprites (normal + shiny) for every species in src/data.json,
# trims the transparent padding and saves them to public/sprites/<key>.png and <key>-shiny.png.
# Run: python scripts/fetch-sprites.py   (needs Pillow)
import io, json, pathlib, urllib.request
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "sprites"
URL = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{shiny}{id}.png"
FORM_IDS = {"corsola-galar": 10173, "qwilfish-hisui": 10234}  # regional forms use a pokemon id, not the species id

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGBA")

species = json.loads((ROOT / "src" / "data.json").read_text(encoding="utf-8"))["species"]
OUT.mkdir(parents=True, exist_ok=True)
for key, sp in species.items():
    pid = FORM_IDS.get(key, sp["id"])
    for shiny, suffix in (("", ""), ("shiny/", "-shiny")):
        img = fetch(URL.format(shiny=shiny, id=pid))
        img.crop(img.getbbox()).save(OUT / f"{key}{suffix}.png")
    print(key)
