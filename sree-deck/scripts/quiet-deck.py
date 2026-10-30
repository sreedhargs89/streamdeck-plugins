#!/usr/bin/env python3
"""Re-skin ~/.config/sree-deck/deck.json in the "quiet" style and fold it into 8 main keys + folders.

Keeps every action as it is; only the layout and the icons change (SF Symbols, white on grey, small label).
Live plugin keys (agents, meeting, audio) keep drawing themselves. The previous deck is saved as deck.colourful.json.
    python3 scripts/quiet-deck.py
"""
import copy, json, os, subprocess, tempfile

C = os.path.expanduser("~/.config/sree-deck")
ICONS = os.path.join(C, "icons/quiet")
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(ICONS, exist_ok=True)

old = json.load(open(os.path.join(C, "deck.json")))
json.dump(old, open(os.path.join(C, "deck.colourful.json"), "w"), indent=2)
k = old["keys"]
specs = []

def icon(name, symbol, label, bg=None):
    out = os.path.join(ICONS, f"{name}.png")
    specs.append({"out": out, "symbol": symbol, "label": label, **({"bg": bg} if bg else {})})
    return f"icons/quiet/{name}.png"

def quiet(key, name, symbol, label):
    key = copy.deepcopy(key)
    key.pop("title", None)
    key["icon"] = icon(name, symbol, label)
    return key

def folder(name, symbol, label, keys):
    return {"type": "folder", "icon": icon(name, symbol, label), "keys": keys}

def more(name, keys):
    return folder(name, "ellipsis", "More", keys)

# ---- Prompts: Reply + Ticket, then the IT Ops prompts ----
by_file = {os.path.basename(x.get("file", "")): x for x in k[14]["keys"]}
PROMPTS = [
    ("read-mail", "envelope.open", "Read mail"), ("reply-simple", "arrowshape.turn.up.left.2", "Reply simple"),
    ("make-simpler", "textformat.size.smaller", "Make simpler"), ("check-replies", "tray.and.arrow.down", "Any replies?"),
    ("comment-ticket", "text.bubble", "Comment\nticket"), ("find-ticket", "magnifyingglass", "Find ticket"),
    ("open-chrome", "globe", "Open in\nChrome"), ("double-check", "checkmark.seal", "Double check"),
    ("status", "list.bullet.clipboard", "Status"), ("user-access", "person.badge.key", "User access"),
    ("licence", "person.text.rectangle", "Licence"), ("device", "laptopcomputer", "Device"),
    ("cost", "dollarsign.circle", "Cloud cost"), ("dashboard", "chart.bar.xaxis", "Dashboard"),
]
prompts = [quiet(k[10], "p-reply", "arrowshape.turn.up.left", "Reply"), quiet(k[11], "p-ticket", "ticket", "Ticket")]
prompts += [quiet(by_file[f"{f}.txt"], f"p-{f}", sym, lab) for f, sym, lab in PROMPTS]

# ---- Work: Wrike, Arc, Admin, Audio, Meet ----
WRIKE = [("IT&Tr Board", "square.grid.3x3"), ("Q4 IT Ops", "folder"), ("AGPRO Infra", "folder"), ("My Work", "person.crop.circle"),
         ("Power Platform", "folder"), ("SharePoint", "folder"), ("Access &\nLicences", "folder"), ("AI Agents", "folder"),
         ("Immutable PoC", "folder"), ("Remove\nTatsu GA", "checkmark.circle"), ("ServiceNow\nCSM SSO", "checkmark.circle"),
         ("PP API\nfirewall", "checkmark.circle"), ("Mac Studio\nSSH", "checkmark.circle"), ("Audit check", "checkmark.circle")]
wrike = folder("f-wrike", "checklist", "Wrike", [quiet(x, f"w{n}", sym, lab) for n, (x, (lab, sym)) in enumerate(zip(k[13]["keys"], WRIKE))])

ARC = [("building.2", "it-ops-asahi"), ("house", "sreedhargs89"), ("shield.lefthalf.filled", "admin@apl"),
       ("laptopcomputer", "tech@apl"), ("briefcase", "sree@apl")]
arc = folder("f-arc", "safari", "Arc spaces", [quiet(x, f"a{n}", sym, lab) for n, (x, (sym, lab)) in enumerate(zip(k[12]["keys"], ARC))])

ADMIN_SYM = {"Entra Users": "person.2", "Entra Groups": "person.3", "Enterprise Apps (SSO)": "square.grid.2x2",
             "Licences": "person.text.rectangle", "Sign-in Logs": "list.bullet.rectangle", "Cond. Access": "lock.shield",
             "Entra Home": "house", "Intune Devices": "desktopcomputer", "Intune macOS": "laptopcomputer",
             "macOS Scripts": "terminal", "Intune Config": "gearshape.2", "Defender": "shield", "Cloud App Catalog": "cloud",
             "M365 Admin": "building.columns", "Azure": "cloud", "AWS Portal": "key", "AWS Tokyo": "globe.asia.australia",
             "AWS Cost": "dollarsign.circle", "Power Platform": "bolt", "Power BI Admin": "chart.bar",
             "Exchange Admin": "envelope", "Teams Admin": "person.3", "Purview": "eye"}
def admin_keys(keys, prefix):
    out = []
    for n, x in enumerate(keys):
        if x.get("type") == "folder":
            out.append(more(f"{prefix}m", admin_keys(x["keys"], prefix + "m")))
        else:
            t = x.get("title", "").replace("\n", " ")
            out.append(quiet(x, f"{prefix}{n}", ADMIN_SYM.get(t), x.get("title", "")))
    return out
work_old = k[15]["keys"]
admin = folder("f-admin", "wrench.and.screwdriver", "Admin", admin_keys(work_old[0]["keys"], "ad"))

def audio_keys(keys, prefix):
    out = []
    for n, x in enumerate(keys):
        if x.get("type") == "folder": out.append(more(f"{prefix}m", audio_keys(x["keys"], prefix + "m")))
        elif x.get("type") == "volume":
            sym, lab = {"mute": ("speaker.slash", "Mute"), "down": ("speaker.wave.1", "Volume −"), "up": ("speaker.wave.3", "Volume +")}[x["do"]]
            out.append(quiet(x, f"{prefix}{n}", sym, lab))
        elif x.get("type") == "open": out.append(quiet(x, f"{prefix}{n}", "gearshape", "Sound\nsettings"))
        else: out.append(x)  # live audio device keys draw themselves
    return out
audio = folder("f-audio", "headphones", "Audio", audio_keys(work_old[1]["keys"], "au"))

MEET = [("mic.slash", "Teams\nmute"), ("video.slash", "Teams\ncamera"), ("hand.raised", "Teams\nhand"), ("rectangle.on.rectangle", "Teams\nshare"),
        ("phone.down", "Teams\nleave"), ("mic.slash", "Zoom\nmute"), ("video.slash", "Zoom\ncamera"), ("hand.raised", "Zoom\nhand"),
        ("rectangle.on.rectangle", "Zoom\nshare"), ("phone.down", "Zoom\nleave"), ("headphones", "Slack\nhuddle"), ("mic.slash", "Slack\nmute"),
        ("mic.slash.circle", "Mic kill")]
meet_old = work_old[2]["keys"]
meet_keys = [quiet(x, f"mt{n}", sym, lab) for n, (x, (sym, lab)) in enumerate(zip(meet_old, MEET))]
emoji = meet_old[13]; emoji = {**emoji, "icon": icon("f-emoji", "face.smiling", "Emoji")}  # emoji keys stay emoji: they are the content
meet = folder("f-meet", "video", "Meet", meet_keys + [emoji])

work = folder("f-work", "briefcase", "Work", [wrike, arc, admin, audio, meet])

# ---- Agents: every herdr tab ----
agents = {**k[7], "icon": icon("f-agents", "terminal", "Agents")}

# ---- Dictate: off = quiet mic, on = red "listening" (colour = meaning) ----
dictate = {**k[9], "icons": [icon("dictate-off", "mic", "Dictate"), icon("dictate-on", "mic.fill", "Listening", bg="#B71C1C")]}

QUIET = {"theme": "quiet"}
active = lambda n: {**k[n], "settings": {**k[n]["settings"], **QUIET}}
deck = {"columns": 8, "rows": 1, "keys": [
    k[0], active(1), active(2), k[8], dictate,
    folder("f-prompts", "text.bubble", "Prompts", prompts), agents, work,
]}
# herdr tiles in the Agents folder use the quiet base too
deck["keys"][6]["keys"] = [{**x, "settings": {**x.get("settings", {}), **QUIET}} if x.get("action") == "com.sree.herdr.slot" else x for x in deck["keys"][6]["keys"]]

with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
    json.dump(specs, f)
subprocess.run(["swift", os.path.join(HERE, "quiet-icons.swift"), f.name], check=True)
json.dump(deck, open(os.path.join(C, "deck.json"), "w"), indent=2)
print("quiet deck written; previous saved as deck.colourful.json")
