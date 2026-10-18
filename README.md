# Stream Deck plugins

Personal Elgato Stream Deck plugins (macOS, Stream Deck 7.1+, Node.js 24).

| Plugin | What it does |
|---|---|
| [`herdr/`](herdr/) | **herdr Live**: live, self-syncing tiles for herdr tabs/agents with status dots, a "Needs me" key and paging |

## Install on a new Mac

```bash
git clone git@gitlab.com:sreedhargs89/streamdeck-plugins.git
cd streamdeck-plugins/herdr
npm install
npm run pack                       # builds dist/com.sree.herdr.streamDeckPlugin
open dist/com.sree.herdr.streamDeckPlugin   # double-click install into Stream Deck
node scripts/install-folder.js --list
node scripts/install-folder.js --profile "Profile 1" --page 1 --key 3,0
```

For development, use `npm run link` (symlinks the plugin into Stream Deck) and `npm run reload` after edits.

Each plugin lives in its own folder with its own `package.json`, tests and README.
