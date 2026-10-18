# Stream Deck plugins

Personal Elgato Stream Deck plugins (macOS, Stream Deck 7.1+, Node.js 24).

| Plugin | What it does |
|---|---|
| [`herdr/`](herdr/) | **herdr Live**: live, self-syncing tiles for herdr tabs/agents with status dots, a "Needs me" key and paging |
| [`m365/`](m365/) | **M365 Live**: Next Meeting key, a countdown that changes colour as the meeting gets close; tap to join Teams/Zoom |

## Install on a new Mac

```bash
git clone https://github.com/sreedhargs89/streamdeck-plugins.git
cd streamdeck-plugins/herdr
npm install
npm run pack                       # builds dist/com.sree.herdr.streamDeckPlugin
open dist/com.sree.herdr.streamDeckPlugin   # double-click install into Stream Deck
node scripts/install-folder.js --list
node scripts/install-folder.js --profile "Profile 1" --page 1 --key 3,0
```

For development, use `npm run link` (symlinks the plugin into Stream Deck) and `npm run reload` after edits.

> After moving a plugin folder, run `npm run link` again **and restart the Stream Deck app**. Unlinking stops
> the plugin, and Stream Deck does not start it again until the app restarts.

Each plugin lives in its own folder with its own `package.json`, tests and README.
