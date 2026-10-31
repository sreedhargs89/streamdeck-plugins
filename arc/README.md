# Arc Spaces — Stream Deck plugin

One action, **Arc Space**: press to bring Arc to the front and switch it to a space (by its name in Arc's sidebar).
Settings: `space` — the exact space name, e.g. `administrator@avyuktaiverse.com`. Shows ✓ on success, ⚠ if the space wasn't found.

No dependencies: talks to Stream Deck over Node's built-in WebSocket and runs `osascript`.

    npm test                 # escaping tests
    npm run link             # symlink into Stream Deck's Plugins folder
