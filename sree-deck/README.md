# Sree Deck — a floating 8-key Stream Deck app for the Mac

A small always-on-top deck (4×2 by default) that runs the **same Stream Deck plugins** as a real
Stream Deck — herdr Live, M365 Live, Wispr Keys — so live tiles (agents waiting, meeting countdown,
dictation on/off) look and behave exactly like on the hardware.

- Never takes focus: click a key and your typing stays in the app you were in.
- **⌃⌥⌘Space** shows/hides it; drag it by the dark border; it remembers where you put it.
- Menu-bar 🎛: Show/Hide, Edit Keys…, Reload, Launch at Login, Quit.

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
    { "type": "keys", "keys": ["58+18"] }
  ]
}
```

Keys fill left-to-right, top-to-bottom. `icon` paths are relative to `~/.config/sree-deck/`. After editing,
use **Reload** in the menu-bar. `text` keys paste the text (clipboard is restored) and press Enter if `enter`.

## Build

```bash
./scripts/build-app.sh     # compiles, bundles the host, installs ~/Applications/Sree Deck.app and launches it
```

Needs Xcode command-line tools, Node 24 (Stream Deck's bundled one is used if present) and the Wispr Keys
plugin built (its `bin/keys` helper presses real keys). On first launch macOS asks for **Accessibility** —
allow it so prompt and shortcut keys can type. The build is ad-hoc signed, so after a rebuild macOS may ask again.
