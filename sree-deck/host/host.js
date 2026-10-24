// Sree Deck host: runs Stream Deck plugins for the Sree Deck app.
//
// It plays the part of the Stream Deck app for each plugin (same launch arguments, same WebSocket
// protocol), so herdr Live / M365 Live / Wispr Keys run unchanged. Built-in keys (type text, open,
// shortcut) are handled here too.
//
// Talks to the Swift app with JSON lines:
//   stdout  {"t":"layout","columns":4,"rows":2}  {"t":"img","i":0,"png":"<base64>"}  {"t":"flash","i":0,"kind":"ok"|"alert"}  {"t":"log","msg":"…"}
//   stdin   {"t":"down","i":0}  {"t":"up","i":0}  {"t":"reload"}
import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { loadDeck, pluginDir, initialImage, CONFIG } from "./deck.js";
import { toPng } from "./render.js";

const DEVICE = "sree-deck";
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const log = (msg) => send({ t: "log", msg });

let deck, keys, plugins, server;

/** Key state: { cfg, context, state, settings, column, row } */
function boot() {
  deck = loadDeck();
  send({ t: "layout", columns: deck.columns, rows: deck.rows });
  keys = deck.keys.map((cfg, i) => ({
    i, cfg,
    context: `sreedeck-${i}`,
    state: 0,
    settings: { ...(cfg.settings ?? {}) },
    column: i % deck.columns,
    row: Math.floor(i / deck.columns),
  }));
  for (const k of keys) paintDefault(k);
  startPlugins();
}

function paintDefault(k) {
  const img = initialImage(k.cfg, k.state);
  if (img) toPng(img).then((png) => send({ t: "img", i: k.i, png })).catch((e) => log(`image ${k.i}: ${e.message}`));
  else send({ t: "img", i: k.i, png: "" });
}

// ---------- Stream Deck plugin protocol ----------
function startPlugins() {
  plugins = new Map(); // uuid -> { proc, ws, keys: [...] }
  for (const k of keys) {
    if (!k.cfg.plugin) continue;
    if (!plugins.has(k.cfg.plugin)) plugins.set(k.cfg.plugin, { keys: [], ws: null, proc: null });
    plugins.get(k.cfg.plugin).keys.push(k);
  }
  if (!plugins.size) return;
  server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  server.on("listening", () => {
    const port = server.address().port;
    for (const uuid of plugins.keys()) launch(uuid, port);
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

function launch(uuid, port) {
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
  const node = process.execPath;
  const proc = spawn(node, ["--no-global-search-paths", join(dir, manifest.CodePath), "-port", String(port), "-pluginUUID", uuid, "-registerEvent", "registerPlugin", "-info", JSON.stringify(info)], { cwd: dir, stdio: ["ignore", "ignore", "pipe"] });
  proc.stderr.on("data", (d) => log(`${uuid}: ${String(d).trim().slice(0, 300)}`));
  proc.on("exit", (code) => {
    log(`${uuid} exited (${code})`);
    const p = plugins?.get(uuid);
    if (p && p.proc === proc) setTimeout(() => plugins.get(uuid) === p && launch(uuid, port), 2000); // keep it running, like Stream Deck does
  });
  plugins.get(uuid).proc = proc;
}

const payload = (k, extra = {}) => ({ settings: k.settings, coordinates: { column: k.column, row: k.row }, controller: "Keypad", state: k.state, isInMultiAction: false, ...extra });
const toPluginEvent = (k, event, extra) => ({ action: k.cfg.action, event, context: k.context, device: DEVICE, payload: payload(k, extra) });

function registered(uuid, ws) {
  const p = plugins.get(uuid);
  if (!p) return ws.close();
  p.ws = ws;
  log(`${uuid} connected`);
  for (const k of p.keys) ws.send(JSON.stringify(toPluginEvent(k, "willAppear")));
}

function fromPlugin(ws, m) {
  const k = keys.find((x) => x.context === m.context);
  switch (m.event) {
    case "setImage":
      if (!k) return;
      if (!m.payload?.image) return paintDefault(k);
      return toPng(m.payload.image).then((png) => send({ t: "img", i: k.i, png })).catch((e) => log(`render ${k.i}: ${e.message}`));
    case "setState":
      if (!k) return;
      k.state = m.payload?.state ?? 0;
      return paintDefault(k);
    case "showOk":
    case "showAlert":
      return k && send({ t: "flash", i: k.i, kind: m.event === "showOk" ? "ok" : "alert" });
    case "setSettings":
      if (k) k.settings = m.payload ?? {};
      return;
    case "getSettings":
      return k && ws.send(JSON.stringify({ action: k.cfg.action, event: "didReceiveSettings", context: k.context, device: DEVICE, payload: payload(k) }));
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

async function builtin(k) {
  const c = k.cfg;
  if (c.type === "text") {
    // like Stream Deck's Text action: paste it (fast, any length), optionally press Enter; then put the clipboard back
    const before = await new Promise((r) => execFile("/usr/bin/pbpaste", (e, out) => r(e ? "" : out)));
    await run("/usr/bin/pbcopy", [], c.text);
    await pressKeys("55+9"); // cmd+v
    if (c.enter) await pressKeys("36");
    setTimeout(() => run("/usr/bin/pbcopy", [], before), 800);
  } else if (c.type === "open") {
    await run("/usr/bin/open", c.app ? ["-a", c.app] : [c.url]);
  } else if (c.type === "keys") {
    await pressKeys(...c.keys);
  }
}

// ---------- input from the app ----------
function press(i, down) {
  const k = keys?.[i];
  if (!k) return;
  if (k.cfg.plugin) {
    const p = plugins.get(k.cfg.plugin);
    p?.ws?.send(JSON.stringify(toPluginEvent(k, down ? "keyDown" : "keyUp")));
  } else if (!down) {
    builtin(k).then(() => send({ t: "flash", i, kind: "ok" })).catch((e) => { log(`key ${i}: ${e.message}`); send({ t: "flash", i, kind: "alert" }); });
  }
}

function shutdown() {
  const old = plugins;
  plugins = null;
  for (const p of old?.values() ?? []) p.proc?.kill();
  server?.close();
}

createInterface({ input: process.stdin }).on("line", (line) => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  if (m.t === "down" || m.t === "up") press(m.i, m.t === "down");
  else if (m.t === "reload") { shutdown(); boot(); }
});
process.stdin.on("end", () => { shutdown(); process.exit(0); });
process.on("SIGTERM", () => { shutdown(); process.exit(0); });

log(`config ${CONFIG}`);
boot();
