// Deck config (~/.config/sree-deck/deck.json), folder pages, and what each key looks like before a plugin draws it.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, isAbsolute } from "node:path";

export const CONFIG_DIR = join(homedir(), ".config/sree-deck");
export const CONFIG = join(CONFIG_DIR, "deck.json");
const PLUGINS = join(homedir(), "Library/Application Support/com.elgato.StreamDeck/Plugins");

/**
 * {
 *   "columns": 8, "rows": 2,
 *   "keys": [
 *     { "plugin": "com.sree.herdr", "action": "com.sree.herdr.needs" },
 *     { "plugin": "com.sree.wispr", "action": "com.sree.wispr.keys", "settings": { "keys": "fn", "hold": true }, "icon": "icons/ptt.png" },
 *     { "type": "text", "text": "/stn ", "enter": false, "icon": "icons/scan.png" },
 *     { "type": "open", "url": "https://…", "title": "Azure" },  { "type": "open", "app": "Ghostty" },
 *     { "type": "keys", "keys": ["58+18"] },  { "type": "volume", "do": "up" | "down" | "mute" },
 *     { "type": "folder", "title": "Wispr", "icon": "icons/wispr.png", "keys": [ … ] }
 *   ]
 * }
 * Folders open as a drawer of 1–2 rows under the main keys (folders inside folders get ◀ Back in the drawer).
 */
export function loadDeck(path = CONFIG) {
  const d = JSON.parse(readFileSync(path, "utf8"));
  return { columns: Number(d.columns) || 4, rows: Number(d.rows) || 2, keys: d.keys ?? [] };
}

/** The main keys, padded with blanks to the deck size. */
export function pageKeys(deck) {
  const n = deck.columns * deck.rows;
  return Array.from({ length: n }, (_, i) => deck.keys[i] ?? {});
}

/**
 * The drawer under the main keys for the open folders (outermost first): nothing when closed, otherwise the
 * innermost folder's keys — with ◀ Back first when it's a folder inside a folder — in 1 or 2 full rows.
 */
export function drawerKeys(deck, folders) {
  if (!folders.length) return [];
  const inner = folders.at(-1);
  const keys = [...(folders.length > 1 ? [{ type: "back" }] : []), ...(inner.keys ?? [])].slice(0, deck.columns * 2);
  const rows = Math.max(1, Math.ceil(keys.length / deck.columns));
  return Array.from({ length: rows * deck.columns }, (_, i) => keys[i] ?? {});
}

/** The key image with a highlight frame (the folder whose drawer is open). */
export function outlined(image) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144"><image width="144" height="144" href="${image}" xlink:href="${image}"/><rect x="4" y="4" width="136" height="136" rx="14" fill="none" stroke="#40C4FF" stroke-width="8"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Every plugin used anywhere in the deck, folders included (started once, up front). */
export function pluginsIn(deck) {
  const out = new Set();
  const walk = (keys) => keys?.forEach((k) => { if (k.plugin) out.add(k.plugin); if (k.keys) walk(k.keys); });
  walk(deck.keys);
  return out;
}

export const pluginDir = (uuid) => [join(PLUGINS, `${uuid}.sdPlugin`)].find(existsSync);

const file = (p) => (isAbsolute(p) ? p : join(CONFIG_DIR, p));
const asDataUri = (f) => {
  if (!f || !existsSync(f)) return null;
  const type = f.endsWith(".svg") ? "image/svg+xml" : "image/png";
  return `data:${type};base64,${readFileSync(f).toString("base64")}`;
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A Stream Deck-style tile: optional background image, optional title (bottom, or centred when there's no image). */
export function tile({ image, title, emoji, bg = "#1c1f24" }) {
  const lines = String(title ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 3);
  const size = image ? 17 : lines.some((l) => l.length > 9) ? 19 : 22;
  const y0 = image ? 138 - (lines.length - 1) * size * 1.1 : 72 - ((lines.length - 1) * size * 1.15) / 2 + size / 3 + (emoji ? 22 : 0);
  const text = lines
    .map((l, i) => `<text x="72" y="${y0 + i * size * (image ? 1.1 : 1.15)}" font-family="Helvetica Neue" font-size="${size}" font-weight="700" fill="#fff" text-anchor="middle" stroke="#000" stroke-width="${image ? 3 : 0}" paint-order="stroke">${esc(l)}</text>`)
    .join("");
  const emo = emoji ? `<text x="72" y="${lines.length ? 62 : 92}" font-family="Apple Symbols, Helvetica Neue" font-size="${lines.length ? 44 : 64}" fill="#fff" text-anchor="middle">${emoji}</text>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144"><rect width="144" height="144" fill="${bg}"/>${image ? `<image width="144" height="144" href="${image}" xlink:href="${image}"/>` : ""}${emo}${text}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** What a key shows before (or without) a plugin drawing it. */
export function keyImage(cfg, state = 0) {
  if (cfg.type === "back") return tile({ emoji: "◀", title: "Back", bg: "#37474F" });
  const icons = [].concat(cfg.icons ?? cfg.icon ?? []);
  const image = asDataUri(icons[Math.min(state, icons.length - 1)] && file(icons[Math.min(state, icons.length - 1)])) ?? pluginImage(cfg, state);
  const title = cfg.showTitle === false ? "" : cfg.title;
  if (image && !title) return image;
  if (image || title) return tile({ image, title });
  if (cfg.type === "folder") return tile({ emoji: "▤", title: "Folder" });
  return null; // blank key
}

function pluginImage(cfg, state) {
  if (!cfg.plugin) return null;
  const dir = pluginDir(cfg.plugin);
  if (!dir) return null;
  const action = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")).Actions.find((a) => a.UUID === cfg.action);
  const img = action?.States?.[Math.min(state, (action?.States?.length ?? 1) - 1)]?.Image;
  if (!img) return null;
  return asDataUri([`${img}@2x.png`, `${img}.png`, `${img}.svg`].map((f) => join(dir, f)).find(existsSync));
}
