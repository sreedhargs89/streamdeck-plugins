#!/usr/bin/env python3
"""Give keys whose title contains emoji a real PNG icon (the SVG renderer can't draw colour emoji).

Walks ~/.config/sree-deck/deck.json (folders included). For each key with a title containing emoji and no
icon: draws the emoji big, with any remaining words as a label, saves icons/emoji/<hash>.png, sets "icon".
    python3 scripts/emoji-icons.py
"""
import hashlib, json, os, re
from PIL import Image, ImageDraw, ImageFont

CONF = os.path.expanduser("~/.config/sree-deck")
OUT = os.path.join(CONF, "icons/emoji")
EMO = ImageFont.truetype("/System/Library/Fonts/Apple Color Emoji.ttc", 160)
TXT = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 22)
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿⬀-⯿️‍]+")

def draw(emoji, label):
    im = Image.new("RGB", (144, 144), "#1c1f24"); d = ImageDraw.Draw(im)
    e = Image.new("RGBA", (400, 220)); ImageDraw.Draw(e).text((10, 10), emoji, font=EMO, embedded_color=True)
    e = e.crop(e.getbbox()); size = 60 if label else 84; e.thumbnail((size * 2, size), Image.LANCZOS)
    top = 18 if label else 30
    im.paste(e, ((144 - e.width) // 2, top + (size - e.height) // 2), e)
    if label:
        w = d.textlength(label, font=TXT); d.text(((144 - w) / 2, 104), label, font=TXT, fill="#fff")
    return im

def walk(keys, made):
    for k in keys:
        if k.get("type") == "folder": walk(k.get("keys", []), made)
        title = k.get("title") or ""
        if k.get("icon") or not EMOJI.search(title): continue
        emoji = "".join(EMOJI.findall(title)).replace("‍", "")[:8]
        emoji = "".join(EMOJI.findall(title))
        label = " ".join(EMOJI.sub(" ", title).split())
        name = hashlib.sha1(title.encode()).hexdigest()[:16] + ".png"
        draw(emoji, label).save(os.path.join(OUT, name))
        k["icon"] = f"icons/emoji/{name}"
        k.pop("title", None)
        made.append(title.replace("\n", " "))

os.makedirs(OUT, exist_ok=True)
path = os.path.join(CONF, "deck.json")
deck = json.load(open(path)); made = []
walk(deck["keys"], made)
json.dump(deck, open(path, "w"), indent=2)
print(f"{len(made)} emoji icons:", ", ".join(made))
