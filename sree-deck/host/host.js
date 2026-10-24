// Sree Deck host: runs Stream Deck plugins for the Sree Deck app.
//
// It plays the part of the Stream Deck app for each plugin (same launch arguments, same WebSocket
// protocol), so herdr Live / M365 Live / Wispr Keys / Audio run unchanged. Folders work like on the
// hardware: opening one swaps the page, plugin keys on the old page get willDisappear and the new ones
// willAppear. Built-in keys (text, open, keys, volume, folder, back) are handled here.
//
// Talks to the Swift app with JSON lines:
//   stdout  {"t":"layout","columns":8,"rows":2}  {"t":"img","i":0,"png":"<base64>"}  {"t":"flash","i":0,"kind":"ok"|"alert"}  {"t":"log","msg":"…"}
//   stdin   {"t":"down","i":0}  {"t":"up","i":0}  {"t":"reload"}  {"t":"home"}
import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { loadDeck, pageKeys, pluginsIn, pluginDir, keyImage, CONFIG } from "./deck.js";
import { toPng } from "./render.js";

const DEVICE = "sree-deck";
const LONG_PRESS_MS = 600; // long-press Back = Home
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const LOG = join(homedir(), "Library/Logs/SreeDeck/host.log");
mkdirSync(join(homedir(), "Library/Logs/SreeDeck"), { recursive: true });
const log = (msg) => {
  send({ t: "log", msg });
  try { appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`); } catch {}
};

let deck, plugins, server, port;
let stack = []; // open folders, each { cfg, path }
let keys = []; // keys on the visible page: { i, cfg, context, column, row }
const keyState = new Map(); // context -> { state, settings } (kept while you browse folders, like Stream Deck)
const downAt = new Map();

function boot() {
  deck = loadDeck();
  send({ t: "layout", columns: deck.columns, rows: deck.rows });
  stack = [];
  startPlugins();
  showPage();
}

const pagePath = () => stack.map((f) => f.path).join("/") || "root";

/** Swap the visible page: old plugin keys disappear, new ones appear (plugins only see what's on screen). */
function showPage() {
  for (const k of keys) if (k.cfg.plugin) toPlugin(k, "willDisappear");
  const cfgs = pageKeys(deck, stack.at(-1)?.cfg);
  const path = pagePath();
  keys = cfgs.map((cfg, i) => {
    const context = `sd-${path}-${i}`.replace(/[^\w-]/g, "_");
    if (!keyState.has(context)) keyState.set(context, { state: 0, settings: { ...(cfg.settings ?? {}) } });
    return { i, cfg, context, column: i % deck.columns, row: Math.floor(i / deck.columns) };
  });
  for (const k of keys) paintDefault(k);
  for (const k of keys) if (k.cfg.plugin) toPlugin(k, "willAppear");
}

function paintDefault(k) {
  const img = keyImage(k.cfg, keyState.get(k.context).state);
  if (!img) return send({ t: "img", i: k.i, png: "" });
  toPng(img).then((png) => keys[k.i] === k && send({ t: "img", i: k.i, png })).catch((e) => log(`image ${k.i}: ${e.message}`));
}

// ---------- Stream Deck plugin protocol ----------
function startPlugins() {
  plugins = new Map([...pluginsIn(deck)].map((uuid) => [uuid, { ws: null, proc: null }]));
  if (!plugins.size) return;
  server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  server.on("listening", () => {
    port = server.address().port;
    for (const uuid of plugins.keys()) launch(uuid);
  });
  server.on("connection", (ws) => {
    ws.on("message", (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (m.event === "registerPlugin") return registered(m.uuid, ws);
      fromPlugin(ws, m);
    });
  });
}

function launch(uuid) {
  const dir = pluginDir(uuid);
  if (!dir) return log(`plugin ${uuid} not installed`);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const info = {
    application: { font: ".AppleSystemUIFont", language: "en", platform: "mac", platformVersion: "26.0", version: "7.6.0.23012" },
    colors: { buttonPressedBackgroundColor: "#303030FF", buttonPressedBorderColor: "#646464FF", buttonPressedTextColor: "#969696FF", disabledColor: "#007AFF59", highlightColor: "#007AFFFF", mouseDownColor: "#005CD7FF" },
    devicePixelRatio: 2,
    devices: [{ id: DEVICE, name: "Sree Deck", size: { columns: deck.columns, rows: deck.rows }, type: 0 }],
    plugin: { uuid, version: manifest.Version },
  };
  const proc = spawn(process.execPath, ["--no-global-search-paths", join(dir, manifest.CodePath), "-port", String(port), "-pluginUUID", uuid, "-registerEvent", "registerPlugin", "-info", JSON.stringify(info)], { cwd: dir, stdio: ["ignore", "ignore", "pipe"] });
  proc.stderr.on("data", (d) => log(`${uuid}: ${String(d).trim().slice(0, 300)}`));
  const p = plugins.get(uuid);
  p.proc = proc;
  proc.on("exit", (code) => {
    log(`${uuid} exited (${code})`);
    if (plugins?.get(uuid) === p && p.proc === proc) setTimeout(() => plugins?.get(uuid) === p && launch(uuid), 2000); // keep it running, like Stream Deck does
  });
}

const payload = (k, extra = {}) => ({ settings: keyState.get(k.context).settings, coordinates: { column: k.column, row: k.row }, controller: "Keypad", state: keyState.get(k.context).state, isInMultiAction: false, ...extra });
function toPlugin(k, event) {
  const ws = plugins?.get(k.cfg.plugin)?.ws;
  if (ws?.readyState === 1) ws.send(JSON.stringify({ action: k.cfg.action, event, context: k.context, device: DEVICE, payload: payload(k) }));
}

function registered(uuid, ws) {
  const p = plugins?.get(uuid);
  if (!p) return ws.close();
  p.ws = ws;
  log(`${uuid} connected`);
  for (const k of keys) if (k.cfg.plugin === uuid) toPlugin(k, "willAppear");
}

function fromPlugin(ws, m) {
  const k = keys.find((x) => x.context === m.context); // only keys on screen get drawn
  const st = keyState.get(m.context);
  switch (m.event) {
    case "setImage":
      if (!k) return;
      if (!m.payload?.image) return paintDefault(k);
      return toPng(m.payload.image).then((png) => keys[k.i] === k && send({ t: "img", i: k.i, png })).catch((e) => log(`render ${k.i}: ${e.message}`));
    case "setState":
      if (!st) return;
      st.state = m.payload?.state ?? 0;
      return k && paintDefault(k);
    case "showOk":
    case "showAlert":
      return k && send({ t: "flash", i: k.i, kind: m.event === "showOk" ? "ok" : "alert" });
    case "setSettings":
      if (st) st.settings = m.payload ?? {};
      return;
    case "getSettings": {
      const any = k ?? { cfg: { action: "" }, context: m.context, column: 0, row: 0 };
      return st && ws.send(JSON.stringify({ action: any.cfg.action, event: "didReceiveSettings", context: m.context, device: DEVICE, payload: payload(any) }));
    }
    case "getGlobalSettings":
      return ws.send(JSON.stringify({ event: "didReceiveGlobalSettings", payload: { settings: globalSettings(m.context) } }));
    case "setGlobalSettings":
      return saveGlobalSettings(m.context, m.payload ?? {});
    case "openUrl":
      return m.payload?.url && execFile("/usr/bin/open", [m.payload.url]);
    case "logMessage":
      return log(`plugin: ${m.payload?.message}`);
    default:
      return; // setTitle, setFeedback, sendToPropertyInspector… not needed on this deck
  }
}

const GLOBALS = join(homedir(), ".config/sree-deck/global-settings.json");
const readGlobals = () => { try { return JSON.parse(readFileSync(GLOBALS, "utf8")); } catch { return {}; } };
const globalSettings = (uuid) => readGlobals()[uuid] ?? {};
function saveGlobalSettings(uuid, s) {
  const all = readGlobals(); all[uuid] = s;
  mkdirSync(join(homedir(), ".config/sree-deck"), { recursive: true });
  writeFileSync(GLOBALS, JSON.stringify(all, null, 2));
}

// ---------- built-in keys ----------
const KEYS_BIN = [join(homedir(), "Library/Application Support/com.elgato.StreamDeck/Plugins/com.sree.wispr.sdPlugin/bin/keys"), join(homedir(), "research/streamdeck-plugins/wispr/com.sree.wispr.sdPlugin/bin/keys")].find(existsSync);
const run = (bin, args, input) => new Promise((resolve) => {
  const p = execFile(bin, args, { timeout: 5000 }, () => resolve());
  if (input !== undefined) { p.stdin.write(input); p.stdin.end(); }
});
const pressKeys = (...combos) => (KEYS_BIN ? run(KEYS_BIN, ["tap", ...combos]) : log("keys helper missing (build the wispr plugin)"));
const osa = (script) => run("/usr/bin/osascript", ["-e", script]);

async function builtin(k) {
  const c = k.cfg;
  switch (c.type) {
    case "text": {
      // like Stream Deck's Text action: paste it (fast, any length), optionally press Enter; then put the clipboard back
      const before = await new Promise((r) => execFile("/usr/bin/pbpaste", (e, out) => r(e ? "" : out)));
      await run("/usr/bin/pbcopy", [], c.text);
      await pressKeys("55+9"); // cmd+v
      if (c.enter) await pressKeys("36");
      setTimeout(() => run("/usr/bin/pbcopy", [], before), 800);
      return true;
    }
    case "open":
      await run("/usr/bin/open", c.app ? ["-a", c.app] : [c.url]);
      return true;
    case "keys":
      await pressKeys(...c.keys);
      return true;
    case "volume":
      if (c.do === "mute") await osa("set volume output muted (not (output muted of (get volume settings)))");
      else await osa(`set volume output volume ((output volume of (get volume settings)) ${c.do === "down" ? "-" : "+"} 6)`);
      return true;
    default:
      return false;
  }
}

// ---------- input from the app ----------
function press(i, down) {
  const k = keys[i];
  if (existsSync(join(homedir(), ".config/sree-deck/debug"))) log(`press ${i} ${down ? "down" : "up"} page=${pagePath()} key=${k?.cfg.type ?? k?.cfg.action}`);
  if (!k) return;
  if (down) downAt.set(i, Date.now());
  if (k.cfg.plugin) return toPlugin(k, down ? "keyDown" : "keyUp");
  if (down) return;
  if (k.cfg.type === "folder") { stack.push({ cfg: k.cfg, path: String(i) }); return showPage(); }
  if (k.cfg.type === "back") {
    if (Date.now() - (downAt.get(i) ?? 0) >= LONG_PRESS_MS) stack = []; else stack.pop();
    return showPage();
  }
  builtin(k).then((did) => did && send({ t: "flash", i, kind: "ok" })).catch((e) => { log(`key ${i}: ${e.message}`); send({ t: "flash", i, kind: "alert" }); });
}

function shutdown() {
  for (const k of keys) if (k.cfg.plugin) toPlugin(k, "willDisappear");
  keys = [];
  const old = plugins;
  plugins = null;
  for (const p of old?.values() ?? []) p.proc?.kill();
  server?.close();
}

createInterface({ input: process.stdin }).on("line", (line) => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  if (m.t === "down" || m.t === "up") press(m.i, m.t === "down");
  else if (m.t === "home") { stack = []; showPage(); }
  else if (m.t === "reload") { shutdown(); boot(); }
});
process.stdin.on("end", () => { shutdown(); process.exit(0); });
process.on("SIGTERM", () => { shutdown(); process.exit(0); });

log(`config ${CONFIG}`);
boot();
