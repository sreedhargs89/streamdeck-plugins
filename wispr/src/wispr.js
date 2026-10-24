// Talks to Wispr Flow: its wispr-flow:// deep links, and real key presses for its shortcuts.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const KEYS_BIN = [join(HERE, "keys"), join(HERE, "../com.sree.wispr.sdPlugin/bin/keys")].find(existsSync) ?? join(HERE, "keys");

// Wispr's deep links (from the app bundle): the only ones that do something useful.
export const LINKS = {
  "start-hands-free": "wispr-flow://start-hands-free",
  "stop-hands-free": "wispr-flow://stop-hands-free",
  "switch-mic": "wispr-flow://switch-mic",
  open: "wispr-flow://open",
};

// Readable names -> macOS key codes (Wispr stores its shortcuts as these codes, e.g. "18+58" = Option+1).
const NAMES = { fn: 63, ctrl: 59, control: 59, opt: 58, option: 58, alt: 58, cmd: 55, command: 55, shift: 56, space: 49, esc: 53, enter: 36 };
const LETTERS = "asdfhgzxcv_bqweryt123465=97-80]ou[ip_lj'k;\\,/nm.";
for (let i = 0; i < LETTERS.length; i++) if (LETTERS[i] !== "_" && !(LETTERS[i] in NAMES)) NAMES[LETTERS[i]] = i;

/** "opt+1" / "fn" / "58+18" -> "58+18" (codes the helper understands); throws on unknown names. */
export function toCodes(combo) {
  const codes = String(combo)
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      if (/^\d+$/.test(p) && Number(p) > 9) return Number(p);
      if (p in NAMES) return NAMES[p];
      throw new Error(`unknown key "${p}"`);
    });
  if (!codes.length) throw new Error("no keys");
  return codes.join("+");
}

const run = (bin, args) =>
  new Promise((resolve, reject) => execFile(bin, args, { timeout: 4000 }, (err, _o, stderr) => (err ? reject(new Error(stderr?.trim() || err.message)) : resolve())));

/** Opens a deep link. In the background (-g) except "open", so the app you're typing in keeps focus and Wispr pastes there. */
export const openArgs = (name) => (name === "open" ? [LINKS.open] : ["-g", LINKS[name] ?? name]);
export const openLink = (name) => run("/usr/bin/open", openArgs(name));
export const keys = (mode, combo) => run(KEYS_BIN, [mode, toCodes(combo)]);
