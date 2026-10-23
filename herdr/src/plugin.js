import streamDeck, { SingletonAction } from "@elgato/streamdeck";
import { writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { snapshot, focusTab, config, orderTabs, keepOrder } from "./herdr.js";
import { slotImage, peekImage, needsImage, moreImage, messageImage } from "./render.js";

const POLL_MS = 1500;
const LONG_PRESS_MS = 450;
const PEEK_MS = 3500;
const FLASH_MS = 6000;
const FREEZE_MS = 3000; // tiles don't reorder this long after a key press, so you never hit a tab that just moved
const RECENT_MS = 10 * 60_000; // a finished tab you were already looking at stays blue this long
const WAITING = new Set(["done", "blocked"]);

const state = {
  tabs: [],
  online: null, // null = not polled yet
  pages: new Map(), // device id -> current page (each Stream Deck pages on its own)
  prevStatus: new Map(), // tab id -> last status, to detect working -> done
  flashUntil: new Map(), // tab id -> timestamp
  doneSince: new Map(), // tab id -> when it turned "done" (for "DONE · 2m")
  freezeUntil: 0,
  lastActive: loadRecency(), // tab id -> last time it ran, changed status or was focused (herdr has no timestamps)
  recencySavedAt: 0,
  needsCursor: null, // last tab id the Needs-me key jumped to
};

const RECENCY_FILE = "logs/recency.json";
function loadRecency() {
  try {
    return new Map(Object.entries(JSON.parse(readFileSync(RECENCY_FILE, "utf8"))));
  } catch {
    return new Map();
  }
}
async function saveRecency(now) {
  if (now - state.recencySavedAt < 30_000) return;
  state.recencySavedAt = now;
  try {
    await mkdir("logs", { recursive: true });
    await writeFile(RECENCY_FILE, JSON.stringify(Object.fromEntries(state.lastActive)));
  } catch {}
}

/** Visible key instances: action id -> { action, kind, slot, lastImage, peekUntil, downAt } */
const keys = new Map();

// Per device: page size = highest slot number showing on that deck (folders may reserve keys for other things).
// A deck showing slots without a More key (e.g. "top 3 tabs" on a home screen) always shows page 1.
const onDevice = (dev, kind) => [...keys.values()].filter((k) => k.device === dev && k.kind === kind);
const slotCount = (dev) => Math.max(1, ...onDevice(dev, "slot").map((k) => k.slot));
const pages = (dev) => Math.max(1, Math.ceil(state.tabs.length / slotCount(dev)));
const pageOf = (dev) => (onDevice(dev, "more").length ? Math.min(state.pages.get(dev) ?? 0, pages(dev) - 1) : 0);
const tabForSlot = (k) => state.tabs[pageOf(k.device) * slotCount(k.device) + k.slot - 1];

async function paint(k, image) {
  if (k.lastImage === image) return;
  k.lastImage = image;
  try {
    await k.action.setImage(image);
  } catch (e) {
    streamDeck.logger.warn(`setImage failed: ${e.message}`);
  }
}

function renderKey(k, now = Date.now()) {
  if (state.online === false) {
    return paint(k, messageImage(k.kind === "slot" && k.slot !== 1 ? [] : ["herdr", "offline"]));
  }
  if (k.kind === "slot") {
    const raw = tabForSlot(k);
    // herdr marks a tab you're looking at "idle" when it finishes; show it as just-done anyway
    const tab = raw && raw.status === "idle" && state.doneSince.has(raw.id) ? { ...raw, status: "done" } : raw;
    if (k.peekUntil > now) return paint(k, peekImage(tab));
    const flashing = tab && (state.flashUntil.get(tab.id) ?? 0) > now;
    const on = flashing && Math.floor(now / 500) % 2 === 0;
    return paint(k, slotImage(tab, { flash: on, doneSince: tab && state.doneSince.get(tab.id), now, style: config.style, pulse: Math.floor(now / 1000) % 2 }));
  }
  if (k.kind === "needs") {
    const waiting = state.tabs.filter((t) => WAITING.has(t.status));
    return paint(k, needsImage(waiting.length, waiting.filter((t) => t.status === "blocked").length));
  }
  const page = pageOf(k.device);
  const shown = (page + 1) * slotCount(k.device);
  return paint(k, moreImage(page, pages(k.device), Math.max(0, state.tabs.length - shown)));
}

// small health file for troubleshooting: <plugin>/logs/status.json
let lastError = null;
async function writeStatus() {
  const visible = {};
  for (const k of keys.values()) visible[k.kind] = (visible[k.kind] ?? 0) + 1;
  const body = { at: new Date().toISOString(), online: state.online, tabs: state.tabs.length, pages: Object.fromEntries(state.pages), visible, lastError };
  try {
    await mkdir("logs", { recursive: true });
    await writeFile("logs/status.json", JSON.stringify(body, null, 2));
  } catch {}
}

const renderAll = () => Promise.all([...keys.values()].map((k) => renderKey(k)));

let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  try {
    const { tabs } = await snapshot();
    const now = Date.now();
    for (const t of tabs) {
      const before = state.prevStatus.get(t.id);
      const finished = before === "working" && (t.status === "done" || t.status === "idle");
      if (finished || (before === "working" && t.status === "blocked")) state.flashUntil.set(t.id, now + FLASH_MS);
      if (finished || (t.status === "done" && before !== undefined && before !== "done" && !state.doneSince.has(t.id))) state.doneSince.set(t.id, now);
      const since = state.doneSince.get(t.id);
      const stale = t.status === "idle" && since && now - since > RECENT_MS;
      if (t.status === "working" || t.status === "blocked" || stale || (t.status === "idle" && !since)) state.doneSince.delete(t.id);
      if (t.status === "working" || t.status === "blocked" || t.focused || (before !== undefined && before !== t.status)) state.lastActive.set(t.id, now);
      state.prevStatus.set(t.id, t.status);
    }
    const live = new Set(tabs.map((t) => t.id));
    for (const id of state.prevStatus.keys()) if (!live.has(id)) state.prevStatus.delete(id);
    for (const id of state.doneSince.keys()) if (!live.has(id)) state.doneSince.delete(id);
    for (const id of state.lastActive.keys()) if (!live.has(id)) state.lastActive.delete(id);
    saveRecency(now);
    if (state.online !== true || tabs.length !== state.tabs.length) streamDeck.logger.info(`herdr online: ${tabs.length} tabs`);
    const frozen = now < state.freezeUntil || [...keys.values()].some((k) => k.peekUntil > now);
    if (config.order !== "status") state.tabs = tabs;
    else if (frozen) state.tabs = keepOrder(tabs, state.tabs.map((t) => t.id));
    else state.tabs = orderTabs(tabs, new Set(state.doneSince.keys()), state.lastActive);
    state.online = true;
  } catch (e) {
    if (state.online !== false) streamDeck.logger.warn(`herdr poll failed: ${e.message}`);
    lastError = e.message;
    state.online = false;
  } finally {
    polling = false;
  }
  await renderAll();
  writeStatus();
}

async function jump(tab, action) {
  if (!tab) return;
  try {
    await focusTab(tab.id);
    state.flashUntil.delete(tab.id);
    if (tab.status === "idle") state.doneSince.delete(tab.id); // seen it: back to normal
    poll();
  } catch (e) {
    streamDeck.logger.error(`focus ${tab.id} failed: ${e.message}`);
    await action.showAlert();
  }
}

class Base extends SingletonAction {
  constructor(manifestId, kind) {
    super();
    this.manifestId = manifestId;
    this.kind = kind;
  }
  onWillAppear(ev) {
    const slot = Number(ev.payload.settings?.slot) || 1;
    const k = { action: ev.action, device: ev.action.device?.id ?? "deck", kind: this.kind, slot, lastImage: null, peekUntil: 0, downAt: 0 };
    keys.set(ev.action.id, k);
    streamDeck.logger.info(`appear ${this.kind}${this.kind === "slot" ? ` #${slot}` : ""} (${keys.size} visible)`);
    return renderKey(k);
  }
  onWillDisappear(ev) {
    keys.delete(ev.action.id);
  }
  onDidReceiveSettings(ev) {
    const k = keys.get(ev.action.id);
    if (!k) return;
    k.slot = Number(ev.payload.settings?.slot) || 1;
    k.lastImage = null;
    return renderKey(k);
  }
}

class SlotAction extends Base {
  constructor() {
    super("com.sree.herdr.slot", "slot");
  }
  onKeyDown(ev) {
    const k = keys.get(ev.action.id);
    if (k) k.downAt = Date.now();
    state.freezeUntil = Date.now() + FREEZE_MS;
  }
  async onKeyUp(ev) {
    const k = keys.get(ev.action.id);
    if (!k) return;
    const tab = tabForSlot(k);
    if (Date.now() - k.downAt >= LONG_PRESS_MS) {
      k.peekUntil = Date.now() + PEEK_MS;
      await renderKey(k);
      setTimeout(() => renderKey(k), PEEK_MS + 50);
      return;
    }
    await jump(tab, ev.action);
  }
}

class NeedsAction extends Base {
  constructor() {
    super("com.sree.herdr.needs", "needs");
  }
  async onKeyUp(ev) {
    const order = { blocked: 0, done: 1 };
    const waiting = state.tabs.filter((t) => WAITING.has(t.status)).sort((a, b) => order[a.status] - order[b.status]);
    if (!waiting.length) return ev.action.showOk();
    const i = waiting.findIndex((t) => t.id === state.needsCursor);
    const next = waiting[(i + 1) % waiting.length];
    state.needsCursor = next.id;
    await jump(next, ev.action);
  }
}

class MoreAction extends Base {
  constructor() {
    super("com.sree.herdr.more", "more");
  }
  async onKeyUp(ev) {
    const dev = keys.get(ev.action.id)?.device ?? "deck";
    state.pages.set(dev, (pageOf(dev) + 1) % pages(dev));
    await renderAll();
  }
}

streamDeck.actions.registerAction(new SlotAction());
streamDeck.actions.registerAction(new NeedsAction());
streamDeck.actions.registerAction(new MoreAction());

setInterval(poll, POLL_MS);
// drive the flash animation between polls
setInterval(() => {
  const now = Date.now();
  if ([...state.flashUntil.values()].some((t) => t > now) || state.tabs.some((t) => t.status === "working")) renderAll();
}, 500);

streamDeck.connect();
poll();
