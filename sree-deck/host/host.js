// Sree Deck host: runs Stream Deck plugins for the Sree Deck app.
//
// It plays the part of the Stream Deck app for each plugin (same launch arguments, same WebSocket
// protocol), so herdr Live / M365 Live / Wispr Keys / Audio run unchanged.
// The main keys never change. A folder opens as a drawer of 1–2 rows below them (click the folder again to
// close; folders inside folders open in the drawer with ◀ Back). Plugin keys in the drawer get
// willAppear/willDisappear as it changes, like keys on a real deck. Built-in keys (text, open, keys, volume)
// are handled here.
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
import { loadDeck, pageKeys, drawerKeys, pluginsIn, pluginDir, keyImage, CONFIG } from "./deck.js";
import { toPng } from "./render.js";

const DEVICE = "sree-deck";
const LONG_PRESS_MS = 600; // long-press Back = close the drawer
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const LOG = join(homedir(), "Library/Logs/SreeDeck/host.log");
mkdirSync(join(homedir(), "Library/Logs/SreeDeck"), { recursive: true });
const log = (msg) => {
  send({ t: "log", msg });
  try { appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`); } catch {}
};

let deck, plugins, server, port;
let stack = []; // drawer: open folders, each { cfg, path }; stack[0].i = the main key that opened it
let keys = []; // keys on the visible page: { i, cfg, context, column, row }
const keyState = new Map(); // context -> { state, settings } (kept while you browse folders, like Stream Deck)
const downAt = new Map();
const FOLDER_DEBOUNCE_MS = 400; // a double-click on a folder shouldn't open and instantly close it
let lastFolderPress = 0;

function boot() {
  deck = loadDeck();
  stack = [];
  keys = [];
  startPlugins();
  render();
}

const pagePath = () => stack.map((f) => f.path).join("/");
const mainCount = () => deck.columns * deck.rows;

/** Main keys stay put; the drawer below them is rebuilt when a folder opens, changes or closes. */
function render() {
  const main = pageKeys(deck);
  const drawer = drawerKeys(deck, stack.map((f) => f.cfg));
  const drawerRows = Math.ceil(drawer.length / deck.columns);
  const next = [...main, ...drawer].map((cfg, i) => {
    const inDrawer = i >= main.length;
    const context = (inDrawer ? `sd-d-${pagePath()}-${i}` : `sd-m-${i}`).replace(/[^\w-]/g, "_");
    if (!keyState.has(context)) keyState.set(context, { state: 0, settings: { ...(cfg.settings ?? {}) } });
    return { i, cfg, context, column: i % deck.columns, row: Math.floor(i / deck.columns) };
  });
  const before = new Map(keys.map((k) => [k.context, k]));
  for (const k of next) if (before.has(k.context)) k.lastPng = before.get(k.context).lastPng;
  const after = new Set(next.map((k) => k.context));
  for (const k of keys) if (k.cfg.plugin && !after.has(k.context)) toPlugin(k, "willDisappear");
  const rowsChanged = !keys.length || keys.length !== next.length;
  keys = next;
  if (rowsChanged) send({ t: "layout", columns: deck.columns, rows: deck.rows + drawerRows });
  send({ t: "drawer", open: stack.length > 0 }); // the app takes Esc (= back) only while a drawer is open
  sendMarks();
  for (const k of keys) {
    const stayed = before.has(k.context);
    if (!stayed || k.i >= mainCount()) paintDefault(k, stayed && !!k.cfg.plugin);
    if (k.cfg.plugin && !stayed) toPlugin(k, "willAppear");
  }
}

// ---------- number keys (⌃1…9): folders when the drawer is closed, the drawer's keys when it's open ----------
function numbered() {
  const list = stack.length
    ? keys.filter((k) => k.i >= mainCount() && k.cfg.type !== "back" && Object.keys(k.cfg).length)
    : keys.filter((k) => k.cfg.type === "folder");
  return list.slice(0, 9);
}
const numberOf = (k) => { const n = numbered().indexOf(k); return n < 0 ? 0 : n + 1; };

/** Sends a key image (badges and the open-folder frame are drawn by the app on top). */
function show(k, png) {
  if (keys[k.i] === k) send({ t: "img", i: k.i, png });
}

/** Tells the app which keys carry a number badge and which folder is open. */
function sendMarks() {
  const badges = {};
  numbered().forEach((k, n) => (badges[k.i] = n + 1));
  send({ t: "marks", badges, open: stack[0]?.i ?? -1 });
}

function paintDefault(k, keepPluginImage = false) {
  if (keepPluginImage && k.lastPng) return show(k, k.lastPng); // plugin keys keep their live image
  const img = keyImage(k.cfg, keyState.get(k.context).state);
  if (!img) return send({ t: "img", i: k.i, png: "" });
  toPng(img)
    .then((png) => { if (k.cfg.plugin) k.lastPng = png; show(k, png); })
    .catch((e) => log(`image ${k.i}: ${e.message}`));
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
    devices: [{ id: DEVICE, name: "Sree Deck", size: { columns: deck.columns, rows: deck.rows + 2 }, type: 0 }], // + drawer
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
      return toPng(m.payload.image).then((png) => { k.lastPng = png; show(k, png); }).catch((e) => log(`render ${k.i}: ${e.message}`));
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
// Key presses are done by the Sree Deck app itself (it holds the Accessibility grant; helpers it starts may not).
const toCombos = (list) => list.map((c) => String(c).split("+").map(Number));
const sendKeys = (mode, combos) => send({ t: "keys", mode, combos: toCombos(combos) });
const pressKeys = async (...combos) => { sendKeys("tap", combos); await new Promise((r) => setTimeout(r, 30 + combos.length * 30)); };

// Wispr Shortcut keys ("opt+1", "fn", "ctrl+e, (ctrl+u, delete)*40") — same syntax as the Wispr Keys plugin
const NAMES = { delete: 51, backspace: 51, fn: 63, ctrl: 59, control: 59, opt: 58, option: 58, alt: 58, cmd: 55, command: 55, shift: 56, space: 49, esc: 53, enter: 36 };
const LETTERS = "asdfhgzxcv_bqweryt123465=97-80]ou[ip_lj'k;\\,/nm.";
for (let i = 0; i < LETTERS.length; i++) if (LETTERS[i] !== "_" && !(LETTERS[i] in NAMES)) NAMES[LETTERS[i]] = i;
const toCodes = (combo) => String(combo).toLowerCase().split("+").map((p) => p.trim()).filter(Boolean).map((p) => (/^\d+$/.test(p) && Number(p) > 9 ? Number(p) : NAMES[p] ?? (() => { throw new Error(`unknown key "${p}"`); })())).join("+");
function toSequence(spec) {
  const out = [];
  for (const m of String(spec).matchAll(/\(([^)]*)\)\s*\*\s*(\d+)|([^,()]+)/g)) {
    if (m[1] !== undefined) { const g = toSequence(m[1]); for (let i = 0; i < Math.min(Number(m[2]), 200); i++) out.push(...g); }
    else if (m[3].trim()) out.push(toCodes(m[3]));
  }
  return out;
}
const osa = (script) => run("/usr/bin/osascript", ["-e", script]);

async function builtin(k) {
  const c = k.cfg;
  switch (c.type) {
    case "text": {
      // like Stream Deck's Text action: paste it (fast, any length), optionally press Enter; then put the clipboard back
      const before = await new Promise((r) => execFile("/usr/bin/pbpaste", (e, out) => r(e ? "" : out)));
      // "file": read the text at press time (e.g. ~/.claude/prompts/*.txt), so editing the file is enough, no reload
      const text = c.file ? readFileSync(c.file.replace(/^~/, homedir()), "utf8").replace(/\s+$/, "") + "\n\n" : c.text;
      await run("/usr/bin/pbcopy", [], text);
      await pressKeys("55+9"); // cmd+v
      if (c.enter) {
        await new Promise((r) => setTimeout(r, 250)); // let the app (Slack, Electron) take the paste before Enter
        await pressKeys("36");
      }
      setTimeout(() => run("/usr/bin/pbcopy", [], before), 800);
      return true;
    }
    case "open":
      await run("/usr/bin/open", c.app ? ["-a", c.app] : [c.url]);
      return true;
    case "keys":
      await pressKeys(...c.keys);
      return true;
    case "arc": {
      // switch Arc to a space (by its name in Arc's sidebar)
      const name = String(c.space).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      await osa(`tell application "Arc"\n activate\n tell front window to tell space "${name}" to focus\nend tell`);
      return true;
    }
    case "volume":
      if (c.do === "mute") await osa("set volume output muted (not (output muted of (get volume settings)))");
      else await osa(`set volume output volume ((output volume of (get volume settings)) ${c.do === "down" ? "-" : "+"} 6)`);
      return true;
    default:
      return false;
  }
}

// ---------- input from the app ----------
function press(i, down, q = 0) {
  let k = keys[i];
  // a split key: four small keys in one; the app tells us which quarter was clicked
  if (k?.cfg.type === "quad") {
    const sub = k.cfg.keys?.[q];
    if (!sub || down) return;
    return builtin({ cfg: sub }).then((did) => did && send({ t: "flash", i, kind: "ok" })).catch((e) => { log(`key ${i}.${q}: ${e.message}`); send({ t: "flash", i, kind: "alert" }); });
  }
  if (existsSync(join(homedir(), ".config/sree-deck/debug"))) log(`press ${i} ${down ? "down" : "up"} page=${pagePath()} key=${k?.cfg.type ?? k?.cfg.action}`);
  if (!k) return;
  if (down) downAt.set(i, Date.now());
  if (k.cfg.action === "com.sree.wispr.keys") {
    const { keys: spec, hold } = keyState.get(k.context).settings;
    try {
      if (hold) sendKeys(down ? "down" : "up", [toCodes(spec)]);
      else if (!down) sendKeys("tap", toSequence(spec));
    } catch (e) { log(`key ${i}: ${e.message}`); send({ t: "flash", i, kind: "alert" }); }
    return;
  }
  if (k.cfg.plugin) return toPlugin(k, down ? "keyDown" : "keyUp");
  if (down) return;
  if (k.cfg.type === "folder" || k.cfg.type === "back") {
    if (Date.now() - lastFolderPress < FOLDER_DEBOUNCE_MS) return;
    lastFolderPress = Date.now();
  }
  if (k.cfg.type === "folder") {
    if (i < mainCount()) stack = stack[0]?.i === i ? [] : [{ cfg: k.cfg, path: String(i), i }]; // open / switch / close the drawer
    else stack.push({ cfg: k.cfg, path: String(i - mainCount()) });
    return render();
  }
  if (k.cfg.type === "back") {
    if (Date.now() - (downAt.get(i) ?? 0) >= LONG_PRESS_MS) stack = []; else stack.pop();
    return render();
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
  if (m.t === "down" || m.t === "up") press(m.i, m.t === "down", m.q ?? 0);
  else if (m.t === "num") {
    if (m.n === 0) { if (!m.down && stack.length) { stack.pop(); render(); } return; } // ⌃0 / Esc: back / close
    const k = numbered()[m.n - 1];
    if (k) press(k.i, !!m.down);
  }
  else if (m.t === "home") { stack = []; render(); }
  else if (m.t === "reload") { shutdown(); boot(); }
});
process.stdin.on("end", () => { shutdown(); process.exit(0); });
process.on("SIGTERM", () => { shutdown(); process.exit(0); });

log(`config ${CONFIG}`);
boot();
