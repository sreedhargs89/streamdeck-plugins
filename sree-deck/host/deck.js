// Deck config (~/.config/sree-deck/deck.json) and where key images come from.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, isAbsolute } from "node:path";

export const CONFIG_DIR = join(homedir(), ".config/sree-deck");
export const CONFIG = join(CONFIG_DIR, "deck.json");
const PLUGINS = join(homedir(), "Library/Application Support/com.elgato.StreamDeck/Plugins");

/**
 * {
 *   "columns": 4, "rows": 2,
 *   "keys": [
 *     { "plugin": "com.sree.herdr", "action": "com.sree.herdr.needs" },
 *     { "plugin": "com.sree.wispr", "action": "com.sree.wispr.keys", "settings": { "keys": "fn", "hold": true }, "icon": "icons/ptt.png" },
 *     { "type": "text", "text": "/stn ", "enter": false, "icon": "icons/scan.png" },
 *     { "type": "open", "url": "https://…" }, { "type": "open", "app": "Ghostty" },
 *     { "type": "keys", "keys": ["opt+1"] }
 *   ]
 * }
 */
export function loadDeck(path = CONFIG) {
  const d = JSON.parse(readFileSync(path, "utf8"));
  const columns = Number(d.columns) || 4, rows = Number(d.rows) || 2;
  const keys = (d.keys ?? []).slice(0, columns * rows);
  while (keys.length < columns * rows) keys.push({});
  return { columns, rows, keys };
}

export const pluginDir = (uuid) => [join(PLUGINS, `${uuid}.sdPlugin`)].find(existsSync);

const asDataUri = (file) => {
  if (!existsSync(file)) return null;
  const type = file.endsWith(".svg") ? "image/svg+xml" : "image/png";
  return `data:${type};base64,${readFileSync(file).toString("base64")}`;
};

/** The image a key shows before (or without) its plugin drawing one: its icon, else the plugin manifest's state image. */
export function initialImage(cfg, state = 0) {
  const icons = [].concat(cfg.icons ?? cfg.icon ?? []);
  const icon = icons[Math.min(state, icons.length - 1)];
  if (icon) return asDataUri(isAbsolute(icon) ? icon : join(CONFIG_DIR, icon));
  if (!cfg.plugin) return null;
  const dir = pluginDir(cfg.plugin);
  if (!dir) return null;
  const action = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).Actions.find((a) => a.UUID === cfg.action);
  const img = action?.States?.[Math.min(state, (action?.States?.length ?? 1) - 1)]?.Image;
  if (!img) return null;
  return asDataUri(join(dir, `${img}@2x.png`)) ?? asDataUri(join(dir, `${img}.png`)) ?? asDataUri(join(dir, `${img}.svg`));
}
