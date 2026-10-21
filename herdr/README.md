# herdr Live — Stream Deck plugin

Live, self-syncing Stream Deck tiles for herdr tabs. Each tile mirrors one herdr tab
(in tab order), with a status dot that updates every 1.5 s.

| Key | Tap | Long-press |
|---|---|---|
| **Agent Slot** (setting `slot`: 1..n) | Jump to that tab in herdr and bring Ghostty to the front | Show the agent's current task title for 3.5 s |
| **Needs Me** | Jump to the next agent that is blocked (first) or done | — |
| **More Tabs** | Show the next page of tabs when there are more tabs than slots | — |

Status dot: 🟢 working · 🟡 done · 🔴 blocked · ⚪ idle. A tile flashes yellow for 6 s when its agent
goes from working to done/blocked. The tab herdr currently shows has a white outline.

## Develop

```bash
npm install
npm run images     # re-render emoji + icons (Swift / AppKit)
npm test           # unit tests + one live herdr snapshot test
npm run reload     # rebuild and restart the plugin inside Stream Deck
node scripts/preview.js > preview/deck.svg   # render the folder from live herdr data
```

`npm run link` installs it into Stream Deck once (symlink). Health check: `com.sree.herdr.sdPlugin/logs/status.json`.

## Use on another Mac / profile

1. `npm install && npm run pack`, then open `dist/com.sree.herdr.streamDeckPlugin` to install it.
2. Add the ready-made folder to any profile (quits and reopens Stream Deck, backs up the profile to the Desktop):
   ```bash
   node scripts/install-folder.js --list
   node scripts/install-folder.js --profile "Profile 1" --page 1 --key 3,0
   ```
   Keys are `column,row` from the top-left. Or drag the three actions from the **herdr Live** category in the app
   and set each Agent Slot's `slot` number.

## Config

Optional `~/.config/streamdeck-herdr.json`:

```json
{ "terminal": "iTerm", "herdr": "/opt/homebrew/bin/herdr", "style": "frame" }
```

Defaults: terminal `Ghostty`; herdr found in `~/.local/bin`, `/opt/homebrew/bin` or `/usr/local/bin`; style `tint`.

Tile colours show the agent status: **blue (pulsing) = running**, **green ✓ = done** (with time since,
also when you were already in that tab: stays green 10 min or until pressed), **red = needs you**, aubergine = idle.
Tabs are grouped by status — **needs you → running → done → idle** (herdr order inside each group);
the layout holds still for 3 s after you press a key. `"order": "herdr"` keeps herdr's fixed order instead.
`"style": "tint"` colours the whole tile; `"frame"` keeps tiles aubergine with a coloured border + label strip.
Restart the plugin after changing the config.

Icons come from tab names — edit `THEMES` / `ALIASES` in `src/render.js`.
