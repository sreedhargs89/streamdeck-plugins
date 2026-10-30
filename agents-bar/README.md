# Agents — menu-bar indicator for herdr agents

`🔴2 🔵1 🟢1` in the menu bar: agents that need you · running · just finished (◦ when all idle). Click for the tabs
grouped by state; pick one to jump to it. Notifications (banner + sound) when an agent gets blocked or finishes —
not for the tab you're looking at; click one to jump to that tab. Launch at Login in the menu.

Reads `herdr api snapshot` every 1.5 s (herdr path/terminal from `~/.config/streamdeck-herdr.json` if set) and jumps
with `herdr tab focus`. Independent of Stream Deck and Sree Deck.

```bash
./scripts/build-app.sh   # builds, signs (stable identity if present), installs ~/Applications/Agents.app, launches
```
