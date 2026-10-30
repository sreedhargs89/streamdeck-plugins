# Sree Deck — a floating 8-key Stream Deck app for the Mac

A small always-on-top deck (4×2 by default) that runs the **same Stream Deck plugins** as a real
Stream Deck — herdr Live, M365 Live, Wispr Keys — so live tiles (agents waiting, meeting countdown,
dictation on/off) look and behave exactly like on the hardware.

- Never takes focus: click a key and your typing stays in the app you were in.
- **⌃⌥⌘Space** shows/hides it; drag it by the dark border; it remembers where you put it.
- **Folders open as a drawer**: your main keys never move; a folder adds 1–2 rows below them (framed in blue
  while open — click it again to close, or another folder to switch). Folders inside folders open in the drawer
  with ◀ Back (long-press = close). Plugin keys in the drawer get willAppear/willDisappear like on a real deck.
- **Number keys — ⌃1 … ⌃9**: folders carry a number badge; ⌃4 opens folder 4, then the badges move to its drawer so
  ⌃2 presses its 2nd key. **Esc** (only while a drawer is open) or ⌃0 = back. Row 2 also has ⌃⌥Q … ⌃⌥I by position;
  holding a key holds it (hold-to-talk works).
- 🔴 close hides the deck (⌃⌥⌘Space or the menu-bar brings it back); 🟡 minimize shrinks it to a 🎛 pill — click
  the pill to expand, drag it to move.
- Menu-bar 🎛: Show/Hide, Home, Edit Keys…, Reload, Launch at Login, Quit.

## How it works

`app/main.swift` (AppKit) draws the panel and starts `host/host.js` (Node 24). The host plays the
Stream Deck app for each plugin: launches it with the usual `-port -pluginUUID -registerEvent -info`
arguments, speaks the WebSocket protocol (`willAppear`, `keyDown`/`keyUp`, `setImage`, `setState`,
`showOk`/`showAlert`, settings), and renders the plugins' SVG images to PNG with resvg. Plugins are found
where Stream Deck installs/links them (`~/Library/Application Support/com.elgato.StreamDeck/Plugins`).
Marketplace plugins (Spotify, Voicemod…) are tied to Elgato's app and aren't supported.

## Keys — `~/.config/sree-deck/deck.json`

```json
{
  "columns": 4, "rows": 2,
  "keys": [
    { "plugin": "com.sree.herdr", "action": "com.sree.herdr.needs" },
    { "plugin": "com.sree.wispr", "action": "com.sree.wispr.keys", "settings": { "keys": "fn", "hold": true }, "icon": "icons/ptt.png" },
    { "type": "text", "text": "/stn ", "enter": false, "icon": "icons/scan.png" },
    { "type": "open", "url": "https://…" },
    { "type": "open", "app": "Ghostty" },
    { "type": "keys", "keys": ["58+18"] },
    { "type": "volume", "do": "up" },
    { "type": "arc", "space": "it-ops-asahi" },
    { "type": "quad", "icon": "icons/quiet/quad-main.png", "keys": [ {…top-left}, {…top-right}, {…bottom-left}, {…bottom-right} ] },
    { "type": "folder", "title": "Work", "icon": "icons/work.png", "keys": [ … ] }
  ]
}
```

A `quad` key is four small keys in one: the app sends which quarter you clicked (draw its icon with a `quad` spec in
`scripts/quiet-icons.swift`). Keys fill left-to-right, top-to-bottom. `icon` paths are relative to `~/.config/sree-deck/`. After editing,
use **Reload** in the menu-bar. `text` keys paste the text (clipboard is restored) and press Enter if `enter`.

## Quiet look

`python3 scripts/quiet-deck.py` re-skins `deck.json`: 8 main keys + folders (Prompts, Agents, Work), every static key
an SF Symbol in white on grey (`scripts/quiet-icons.swift`), colour only for live state. The previous deck is kept as
`deck.colourful.json`; the colourful code is tagged `sree-deck-colourful-20261031`.

## Import folders from a Stream Deck profile

```bash
node scripts/import-xl.js "<ProfilesV3>/<profile>.sdProfile" <page-id> "6-1,4-2"   # keys as col-row
```

Prints Sree Deck folder keys (images copied to `~/.config/sree-deck/icons/xl/`). Website, Open App, Open, Text,
Hotkey, Volume/Mute, folders and `com.sree.*` plugin keys are translated; folders longer than a page are chained
with "More ▶". Paste the output into `deck.json`.

## Build

```bash
./scripts/build-app.sh     # compiles, bundles the host, installs ~/Applications/Sree Deck.app and launches it
```

Key presses (paste, Enter, Wispr shortcuts) are made by the app itself, which holds the Accessibility grant;
builds are signed with your Apple Development identity so the grant survives rebuilds (`~/Library/Logs/SreeDeck/app.log`
shows `Accessibility trusted = true/false` at launch).

For development, `defaults write com.sree.deck HostPath <repo>/sree-deck/host/host.js` makes the app run the
host from the repo, so host changes only need Reload (no rebuild, no new Accessibility prompt). Host log:
`~/Library/Logs/SreeDeck/host.log` (touch `~/.config/sree-deck/debug` to log key presses).

Needs Xcode command-line tools, Node 24 (Stream Deck's bundled one is used if present) and the Wispr Keys
plugin built (its `bin/keys` helper presses real keys). On first launch macOS asks for **Accessibility** —
allow it so prompt and shortcut keys can type. The build is ad-hoc signed, so after a rebuild macOS may ask again.
