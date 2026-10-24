#!/usr/bin/env node
// Imports folders from a Stream Deck profile into Sree Deck format (keys + images), translating Elgato's
// standard actions: Website, Open App, Text, Hotkey, Volume/Mute, Open, folders. Plugin keys (com.sree.*)
// are kept as plugin keys. Marketplace actions that only work inside Elgato's app are skipped.
//
//   import-xl.js <profile-dir> <home-page-id> <key,key,...> [--per-page 15]
//   prints a JSON array of folder keys; images go to ~/.config/sree-deck/icons/xl/
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const [profile, homePage, keyList, ...rest] = process.argv.slice(2);
const PER_PAGE = Number(rest[rest.indexOf("--per-page") + 1]) || 15; // keys per folder page after ◀ Back
const ICONS = join(homedir(), ".config/sree-deck/icons/xl");
mkdirSync(ICONS, { recursive: true });

const page = (id) => JSON.parse(readFileSync(join(profile, "Profiles", id.toUpperCase(), "manifest.json"), "utf8")).Controllers[0].Actions ?? {};
const MOD_CODES = [[1, 56], [2, 59], [4, 58], [8, 55]]; // shift, ctrl, option, command
const MEDIA = { 4: "mute", 5: "up", 6: "down" };
const PLUGINS_OK = /^com\.sree\./;

function icon(pageId, action) {
  const st = action.States?.[0] ?? {};
  if (!st.Image) return undefined;
  const src = join(profile, "Profiles", pageId.toUpperCase(), st.Image);
  if (!existsSync(src)) return undefined;
  const name = createHash("sha1").update(readFileSync(src)).digest("hex").slice(0, 16) + ".png";
  copyFileSync(src, join(ICONS, name));
  return `icons/xl/${name}`;
}
const titleOf = (a) => (a.States?.[0]?.ShowTitle === false ? undefined : a.States?.[0]?.Title || undefined);
// Like the XL: a key with an icon shows just the icon unless its title is explicitly switched on.
const look = (pageId, a) => {
  const ic = icon(pageId, a), t = titleOf(a);
  const showTitle = t && (!ic || a.States?.[0]?.ShowTitle === true);
  return { ...(ic ? { icon: ic } : {}), ...(showTitle ? { title: t } : {}) };
};

function convert(pageId, a) {
  const s = a.Settings ?? {};
  switch (a.UUID) {
    case "com.elgato.streamdeck.system.website":
      return s.path && { type: "open", url: s.path, ...look(pageId, a) };
    case "com.elgato.streamdeck.system.openapp":
      return (s.bundle_path || s.app_name) && { type: "open", app: s.bundle_path || s.app_name, ...look(pageId, a), title: titleOf(a) ?? s.app_name };
    case "com.elgato.streamdeck.system.open":
      return s.path && { type: "open", url: s.path.replace(/^"|"$/g, ""), ...look(pageId, a) };
    case "com.elgato.streamdeck.system.text":
      return { type: "text", text: s.pastedText ?? "", enter: !!s.isSendingEnter, ...look(pageId, a) };
    case "com.elgato.streamdeck.system.hotkey": {
      const combos = (s.Hotkeys ?? []).filter((h) => h.NativeCode >= 0).map((h) => [...MOD_CODES.filter(([bit]) => h.KeyModifiers & bit).map(([, c]) => c), h.NativeCode].join("+"));
      return combos.length && { type: "keys", keys: combos, ...look(pageId, a) };
    }
    case "com.elgato.streamdeck.system.multimedia":
      return MEDIA[s.actionIdx] && { type: "volume", do: MEDIA[s.actionIdx], ...look(pageId, a), ...(icon(pageId, a) ? {} : { title: { mute: "Mute", up: "Vol +", down: "Vol −" }[MEDIA[s.actionIdx]] }) };
    case "com.elgato.streamdeck.profile.openchild":
      return folder(s.ProfileUUID, look(pageId, a));
    case "com.elgato.streamdeck.profile.backtoparent":
      return null;
    default:
      if (PLUGINS_OK.test(a.UUID)) return { plugin: a.Plugin?.UUID ?? a.UUID.split(".").slice(0, 3).join("."), action: a.UUID, settings: s, ...look(pageId, a) };
      return null; // marketplace actions (Spotify, Voicemod…) only run inside Elgato's app
  }
}

/** A Stream Deck folder -> Sree Deck folder; long folders become pages chained with "More ▶". */
function folder(id, lookOf) {
  const acts = page(id);
  const ordered = Object.entries(acts)
    .map(([k, a]) => [k.split(",").map(Number), a])
    .sort(([[c1, r1]], [[c2, r2]]) => r1 - r2 || c1 - c2)
    .map(([, a]) => convert(id, a))
    .filter(Boolean);
  const chain = (keys) => (keys.length <= PER_PAGE ? keys : [...keys.slice(0, PER_PAGE - 1), { type: "folder", title: "More ▶", keys: chain(keys.slice(PER_PAGE - 1)) }]);
  return { type: "folder", ...lookOf, keys: chain(ordered) };
}

const home = page(homePage);
const out = keyList.split(",").map((k) => convert(homePage, home[k.replace("-", ",")]) ?? null);
console.log(JSON.stringify(out, null, 2));
