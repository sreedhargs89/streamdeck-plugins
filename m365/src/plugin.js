import streamDeck, { SingletonAction } from "@elgato/streamdeck";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { Session, interactiveLogin, loadConfig } from "./auth.js";
import { upcomingMeetings, eventBody } from "./graph.js";
import { joinInfo, pick, urgency } from "./meeting.js";
import { meetingImage, detailImage, signinImage, setupImage, errorImage } from "./render.js";

const FETCH_MS = 2 * 60_000; // calendar refresh
const TICK_MS = 500; // countdown + blink
const LONG_PRESS_MS = 450;
const PEEK_MS = 4000;

const cfg = loadConfig();
const session = cfg ? new Session(cfg) : null;

const state = {
  phase: cfg ? "loading" : "setup", // setup | signed_out | signing_in | ok | error
  meetings: [],
  error: null,
  fetchedAt: 0,
};
const keys = new Map(); // action id -> { action, lastImage, downAt, peekUntil }

const open = (target) => new Promise((resolve) => execFile("/usr/bin/open", [target], () => resolve()));

async function refresh() {
  if (!session || state.phase === "signing_in") return;
  try {
    state.meetings = await upcomingMeetings(session);
    state.phase = "ok";
    state.error = null;
    state.fetchedAt = Date.now();
  } catch (e) {
    if (e.code === "signed_out") state.phase = "signed_out";
    else if (!state.fetchedAt || Date.now() - state.fetchedAt > 15 * 60_000) {
      state.phase = "error"; // keep showing cached meetings through short outages
      state.error = e.message;
    }
    streamDeck.logger.warn(`calendar refresh failed: ${e.message}`);
  }
  await status();
  renderAll();
}

function face(k, now = Date.now()) {
  if (state.phase === "setup") return setupImage();
  if (state.phase === "signed_out") return signinImage(false);
  if (state.phase === "signing_in") return signinImage(true);
  if (state.phase === "error") return errorImage(state.error || "");
  if (state.phase === "loading") return signinImage(true);
  const view = pick(state.meetings, now);
  if (k.peekUntil > now) return detailImage(view);
  return meetingImage(view, { blink: urgency(view) === "now" && Math.floor(now / 500) % 2 === 1 });
}

function render(k) {
  const img = face(k);
  if (img === k.lastImage) return;
  k.lastImage = img;
  k.action.setImage(img).catch(() => {});
}
const renderAll = () => keys.forEach(render);

async function status() {
  try {
    await mkdir("logs", { recursive: true });
    const view = pick(state.meetings);
    await writeFile(
      "logs/status.json",
      JSON.stringify({ at: new Date().toISOString(), phase: state.phase, meetings: state.meetings.length, showing: view.meeting?.subject ?? null, mode: view.mode, error: state.error, visible: keys.size }, null, 2)
    );
  } catch {}
}

async function signIn() {
  state.phase = "signing_in";
  renderAll();
  try {
    await interactiveLogin(cfg);
    session.forget();
    state.phase = "loading";
    await refresh();
  } catch (e) {
    streamDeck.logger.error(`sign-in failed: ${e.message}`);
    state.phase = "signed_out";
    renderAll();
  }
}

async function join(action) {
  const view = pick(state.meetings);
  if (view.mode === "none") return action.showOk();
  const m = view.meeting;
  let info = m.join;
  if (!info) {
    // link may be further down the invite than the 255-char preview
    try {
      info = joinInfo(await eventBody(session, m.id));
      m.join = info;
    } catch {}
  }
  if (info) await open(info.app || info.url);
  else if (m.webLink) await open(m.webLink);
  else await open("/Applications/Microsoft Outlook.app");
}

class NextMeeting extends SingletonAction {
  manifestId = "com.sree.m365.next-meeting";
  onWillAppear(ev) {
    keys.set(ev.action.id, { action: ev.action, lastImage: null, downAt: 0, peekUntil: 0 });
    render(keys.get(ev.action.id));
  }
  onWillDisappear(ev) {
    keys.delete(ev.action.id);
  }
  onKeyDown(ev) {
    const k = keys.get(ev.action.id);
    if (k) k.downAt = Date.now();
  }
  async onKeyUp(ev) {
    const k = keys.get(ev.action.id);
    if (!k) return;
    if (state.phase === "setup") return ev.action.showAlert();
    if (state.phase === "signed_out") return signIn();
    if (state.phase !== "ok") return refresh();
    if (Date.now() - k.downAt >= LONG_PRESS_MS) {
      k.peekUntil = Date.now() + PEEK_MS;
      render(k);
      return;
    }
    await join(ev.action);
  }
}

streamDeck.actions.registerAction(new NextMeeting());
streamDeck.connect();

refresh();
setInterval(refresh, FETCH_MS);
setInterval(renderAll, TICK_MS);
