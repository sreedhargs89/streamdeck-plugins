# Wispr Keys — Stream Deck plugin for Wispr Flow

Stream Deck's built-in **Hotkey** action sends modifier *flags* only, and Wispr Flow listens for the
modifier **keys themselves** (and Fn, which Stream Deck can't send at all) — so Wispr shortcuts on a plain
hotkey key do nothing. Its built-in **Open** action also can't open `wispr-flow://` links. This plugin fixes both.

| Action | What it does |
|---|---|
| **Dictate (toggle)** | Press: `wispr-flow://start-hands-free` (key turns red). Press again: stop. |
| **Wispr Shortcut** | Presses a Wispr shortcut with real key events via `bin/keys`. Settings: `keys` (`fn`, `opt+1`, `ctrl+fn`, `fn+p`…), `hold` (key down while you hold the Stream Deck key — push-to-talk with `fn`). |
| **Wispr Link** | `link`: `start-hands-free`, `stop-hands-free`, `switch-mic`, `open`. |

Wispr's default shortcuts: push-to-talk `fn` (hold), Lens `ctrl+fn`, hands-free `fn+space`, paste last `fn+p`,
polish `opt+1`, polish prompt `opt+2`, view diff `opt+o`, scratchpad `opt+s`. The meeting recorder has none by
default — set one in Wispr → Settings → Shortcuts and use it here.

Pressing keys needs **Accessibility** permission for the Stream Deck app (System Settings → Privacy & Security →
Accessibility) — the helper runs as part of it.

```bash
npm install && npm run build && npm run link   # build bundles the JS and compiles bin/keys (needs Xcode tools)
npm test
```
