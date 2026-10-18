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

function profiles() {
  return readdirSync(ROOT)
    .filter((d) => d.endsWith(".sdProfile"))
    .map((d) => ({ dir: join(ROOT, d), manifest: readJson(join(ROOT, d, "manifest.json")) }));
}

if (args.includes("--list") || !opt("profile")) {
  for (const p of profiles()) console.log(`${p.manifest.Name}  (${p.manifest.Pages.Pages.length} pages)`);
  if (!args.includes("--list")) console.log('\nUsage: node scripts/install-folder.js --profile "<name>" --page 1 --key 3,0');
  process.exit(0);
}

const profile = profiles().find((p) => p.manifest.Name === opt("profile"));
if (!profile) throw new Error(`No profile named "${opt("profile")}". Run with --list.`);
const pageNo = Number(opt("page") ?? 1);
const pageId = profile.manifest.Pages.Pages[pageNo - 1];
if (!pageId) throw new Error(`Profile has ${profile.manifest.Pages.Pages.length} pages; page ${pageNo} does not exist.`);
const key = opt("key") ?? "0,0";
if (!/^\d,\d$/.test(key)) throw new Error(`--key must look like 3,0 (column,row), got "${key}"`);

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
const folderActions = {
  "0,0": {
    ActionID: randomUUID(), LinkedTitle: true, Name: "Parent Folder", Resources: null, Settings: {}, State: 0, States: [{}],
    Plugin: { Name: "Open Parent Folder", UUID: "com.elgato.streamdeck.profile.backtoparent", Version: "1.0" },
    UUID: "com.elgato.streamdeck.profile.backtoparent",
  },
  "1,0": plug("com.sree.herdr.needs", "Needs Me"),
  "4,2": plug("com.sree.herdr.more", "More Tabs"),
};
const spots = ["2,0", "3,0", "4,0", "0,1", "1,1", "2,1", "3,1", "4,1", "0,2", "1,2", "2,2", "3,2"];
spots.forEach((pos, i) => (folderActions[pos] = plug("com.sree.herdr.slot", "Agent Slot", { slot: i + 1 })));

const folderId = randomUUID().toUpperCase();
mkdirSync(join(profile.dir, "Profiles", folderId, "Images"), { recursive: true });
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

console.log(`herdr folder added to "${profile.manifest.Name}", page ${pageNo}, key ${key}. Backup: ${backup}`);
if (wasRunning) execSync('open -a "Elgato Stream Deck"');
