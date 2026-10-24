# Plugin + key images (aubergine tiles like herdr): python3 scripts/make-images.py
from PIL import Image, ImageDraw, ImageFont
EMO = ImageFont.truetype("/System/Library/Fonts/Apple Color Emoji.ttc", 160)
TXT = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 21)
OUT = "com.sree.wispr.sdPlugin/imgs/"
def tile(emoji, label=None, strip="#B0BEC5", bg=((0x30, 0x0a, 0x24), (0x4a, 0x14, 0x38))):
    im = Image.new("RGB", (144, 144)); d = ImageDraw.Draw(im)
    for y in range(144):
        t = y / 143; d.line([(0, y), (144, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(*bg)))
    e = Image.new("RGBA", (220, 220)); ImageDraw.Draw(e).text((20, 10), emoji, font=EMO, embedded_color=True)
    e = e.crop(e.getbbox()); size = 58 if label else 84; e.thumbnail((size, size), Image.LANCZOS)
    top = 22 if label else 30
    im.paste(e, ((144 - e.width) // 2, top + (size - e.height) // 2), e)
    if label:
        d.rectangle([0, 108, 144, 144], fill=strip)
        w = d.textlength(label, font=TXT); d.text(((144 - w) / 2, 114), label, font=TXT, fill="#111")
    return im
def save(name, im, small=72):
    im.save(f"{OUT}{name}@2x.png"); im.resize((small, small), Image.LANCZOS).save(f"{OUT}{name}.png")
save("dictate-off", tile("🎙️", "Dictate", "#FF8A80"))
save("dictate-on", tile("🎙️", "● LISTENING", "#FF1744", bg=((0x7f, 0x00, 0x00), (0xc6, 0x28, 0x28))))
save("keys", tile("⌨️", "Shortcut"))
save("link", tile("🪶", "Wispr link"))
save("plugin", tile("🎙️"), 256 // 2)
save("category", tile("🎙️").resize((56, 56)), 28)
