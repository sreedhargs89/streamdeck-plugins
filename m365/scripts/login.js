#!/usr/bin/env node
// One-time setup: saves tenant/client to ~/.config/streamdeck-m365.json and signs in via the browser.
//   npm run login -- --tenant <tenant-id> --client <app-client-id>
//   npm run login            (re-sign-in with the saved config)
//   npm run login -- --logout
import { CONFIG_PATH, Session, interactiveLogin, keychain, loadConfig, saveConfig } from "../src/auth.js";
import { upcomingMeetings } from "../src/graph.js";
import { pick } from "../src/meeting.js";

const args = process.argv.slice(2);
const opt = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);

if (args.includes("--logout")) {
  await keychain.clear();
  console.log("Signed out (refresh token removed from Keychain).");
  process.exit(0);
}

let cfg = loadConfig();
if (opt("tenant") && opt("client")) {
  cfg = { tenant: opt("tenant"), clientId: opt("client") };
  saveConfig(cfg);
  console.log(`Saved ${CONFIG_PATH}`);
}
if (!cfg) {
  console.error("No config yet. Run: npm run login -- --tenant <tenant-id> --client <app-client-id>");
  process.exit(1);
}

console.log("Opening the browser to sign in…");
await interactiveLogin(cfg);
const meetings = await upcomingMeetings(new Session(cfg));
const view = pick(meetings);
console.log(`✅ Signed in. ${meetings.length} meetings in the next 24 h.`);
if (view.meeting) console.log(`Next on the key: ${view.meeting.subject} (${view.mode}, ${view.minutes} min) via ${view.meeting.join?.kind ?? "no link"}`);
process.exit(0);
