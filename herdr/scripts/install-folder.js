#!/usr/bin/env node
// Adds a ready-made "herdr" folder (Back, Needs Me, 12 Agent Slots, More) to a Stream Deck profile.
//
//   node scripts/install-folder.js --list
//   node scripts/install-folder.js --profile "Profile 1" --page 1 --key 3,0 [--force]
//
// Stream Deck must be closed while profiles are edited; the script quits and reopens it for you.
// Keys are "column,row" from the top-left, e.g. 0,0 is the first key and 4,2 the last on a 15-key deck.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, cpSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

// STREAMDECK_PROFILES points at a copy of ProfilesV3 for testing; the app is then left alone
const TESTING = Boolean(process.env.STREAMDECK_PROFILES);
const ROOT = process.env.STREAMDECK_PROFILES || join(homedir(), "Library/Application Support/com.elgato.StreamDeck/ProfilesV3");
const ICON = join(dirname(fileURLToPath(import.meta.url)), "../com.sree.herdr.sdPlugin/imgs/folder-key.png");
const PLUGIN = { Name: "herdr Live", UUID: "com.sree.herdr", Version: "1.0.0.0" };

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, d) => writeFileSync(p, JSON.stringify(d));

// Key grid per Stream Deck model (columns x rows); override with --cols/--rows.
const GRIDS = { "20GAT9901": [8, 4], "20GAT9902": [8, 4], "20GBA9901": [5, 3], "20GAA9901": [5, 3], "20GAA9902": [5, 3], "20GAI9901": [3, 2], "20GBD9901": [4, 2], "20GBJ9901": [4, 2] };
function gridFor(manifest) {
  const [c, r] = GRIDS[manifest.Device?.Model] ?? [5, 3];
  return [Number(opt("cols") ?? c), Number(opt("rows") ?? r)];
}
const CONFIG = join(homedir(), ".config/streamdeck-herdr.json");
const prompts = () => (existsSync(CONFIG) ? (readJson(CONFIG).prompts ?? []) : []);

function profiles() {
  return readdirSync(ROOT)
    .filter((d) => d.endsWith(".sdProfile"))
    .map((d) => ({ dir: join(ROOT, d), manifest: readJson(join(ROOT, d, "manifest.json")) }));
}

if (args.includes("--list") || !opt("profile")) {
  for (const p of profiles()) {
    const [c, r] = gridFor(p.manifest);
    console.log(`${p.dir.split("/").pop().slice(0, 8)}  ${p.manifest.Name}  (${p.manifest.Device?.Model ?? "?"}, ${c}x${r}, ${p.manifest.Pages.Pages.length} pages)`);
  }
  if (!args.includes("--list")) console.log('\nUsage: node scripts/install-folder.js --profile "<name>" --page 1 --key 3,0');
  process.exit(0);
}

const matches = profiles().filter((p) => p.manifest.Name === opt("profile") || p.dir.split("/").pop().startsWith(opt("profile")));
if (matches.length !== 1) throw new Error(`${matches.length ? "Several" : "No"} profiles match "${opt("profile")}". Run with --list and use the id shown.`);
const profile = matches[0];
const pageNo = Number(opt("page") ?? 1);
const pageId = profile.manifest.Pages.Pages[pageNo - 1];
if (!pageId) throw new Error(`Profile has ${profile.manifest.Pages.Pages.length} pages; page ${pageNo} does not exist.`);
const key = opt("key") ?? "0,0";
if (!/^\d+,\d+$/.test(key)) throw new Error(`--key must look like 3,0 (column,row), got "${key}"`);

const pageDir = join(profile.dir, "Profiles", pageId.toUpperCase());
const page = readJson(join(pageDir, "manifest.json"));
const actions = (page.Controllers[0].Actions ??= {});
if (actions[key] && !args.includes("--force")) {
  throw new Error(`Key ${key} on page ${pageNo} already has "${actions[key].Name}". Pick a free key or add --force.`);
}

const running = () => {
  try {
    execSync('pgrep -f "MacOS/Stream Deck"', { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const wasRunning = !TESTING && running();
if (wasRunning) {
  execSync(`osascript -e 'quit app "Elgato Stream Deck"' || true`, { stdio: "ignore" });
  for (let i = 0; i < 20 && running(); i++) execSync("sleep 0.5");
  if (running()) throw new Error("Stream Deck did not quit; close it and run again.");
}

// back up the profile first
const backup = join(TESTING ? ROOT : join(homedir(), "Desktop"), `streamdeck-profile-backup-${Date.now()}.sdProfile`);
cpSync(profile.dir, backup, { recursive: true });

const plug = (UUID, Name, Settings = {}) => ({ ActionID: randomUUID(), LinkedTitle: true, Name, Plugin: PLUGIN, Resources: null, Settings, State: 0, States: [{}], UUID });
const textKey = (p, i) => ({
  ActionID: randomUUID(), LinkedTitle: true, Name: "Text", Resources: null, State: 0, UUID: "com.elgato.streamdeck.system.text",
  Plugin: { Name: "Text", UUID: "com.elgato.streamdeck.system.text", Version: "1.0" },
  Settings: { Hotkey: { KeyModifiers: 0, QTKeyCode: 33554431, VKeyCode: -1 }, isSendingEnter: false, isTypingMode: false, pastedText: p.text },
  States: [{ Image: `Images/HERDRPROMPT${i}.png`, ShowTitle: !p.icon, Title: p.title }],
});

// Back, Needs-me, tab slots, More, then the fixed prompt keys (from the config) in the last spots.
const [cols, rows] = gridFor(profile.manifest);
const cells = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push(`${c},${r}`);
const fixed = args.includes("--no-prompts") ? [] : prompts();
const folderActions = {
  [cells[0]]: {
    ActionID: randomUUID(), LinkedTitle: true, Name: "Parent Folder", Resources: null, Settings: {}, State: 0, States: [{}],
    Plugin: { Name: "Open Parent Folder", UUID: "com.elgato.streamdeck.profile.backtoparent", Version: "1.0" },
    UUID: "com.elgato.streamdeck.profile.backtoparent",
  },
  [cells[1]]: plug("com.sree.herdr.needs", "Needs Me"),
};
const promptCells = cells.slice(cells.length - fixed.length);
const moreCell = cells[cells.length - fixed.length - 1];
cells.slice(2, cells.length - fixed.length - 1).forEach((pos, i) => (folderActions[pos] = plug("com.sree.herdr.slot", "Agent Slot", { slot: i + 1 })));
folderActions[moreCell] = plug("com.sree.herdr.more", "More Tabs");
fixed.forEach((p, i) => (folderActions[promptCells[i]] = textKey(p, i)));

const folderId = randomUUID().toUpperCase();
mkdirSync(join(profile.dir, "Profiles", folderId, "Images"), { recursive: true });
const PROMPT_IMGS = join(dirname(fileURLToPath(import.meta.url)), "../com.sree.herdr.sdPlugin/imgs/prompts");
fixed.forEach((p, i) => {
  const src = join(PROMPT_IMGS, `${p.icon}.png`);
  if (p.icon && existsSync(src)) copyFileSync(src, join(profile.dir, "Profiles", folderId, `Images/HERDRPROMPT${i}.png`));
});
writeJson(join(profile.dir, "Profiles", folderId, "manifest.json"), { Controllers: [{ Actions: folderActions, Type: "Keypad" }], Icon: "", Name: "" });

mkdirSync(join(pageDir, "Images"), { recursive: true });
const img = "Images/HERDRFOLDERKEY000000000000Z.png";
if (existsSync(ICON)) copyFileSync(ICON, join(pageDir, img));
actions[key] = {
  ActionID: randomUUID(), LinkedTitle: true, Name: "Create Folder", Resources: null, State: 0, UUID: "com.elgato.streamdeck.profile.openchild",
  Plugin: { Name: "Create Folder", UUID: "com.elgato.streamdeck.profile.openchild", Version: "1.0" },
  Settings: { ProfileUUID: folderId.toLowerCase() },
  States: [{ Image: img, ShowTitle: false, Title: "herdr" }],
};
writeJson(join(pageDir, "manifest.json"), page);

const slots = Object.values(folderActions).filter((a) => a.UUID === "com.sree.herdr.slot").length;
console.log(`herdr folder (${cols}x${rows}: ${slots} tabs, ${fixed.length} prompts) added to "${profile.manifest.Name}", page ${pageNo}, key ${key}. Backup: ${backup}`);
if (wasRunning) execSync('open -a "Elgato Stream Deck"');
