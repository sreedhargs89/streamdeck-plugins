import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, joinInfo, pick, urgency, countdown } from "../src/meeting.js";
import { meetingImage, detailImage, wrap } from "../src/render.js";
import { pkce, loadConfig } from "../src/auth.js";

const T0 = Date.parse("2026-10-19T01:00:00Z");
const iso = (ms) => new Date(ms).toISOString().replace("Z", "0000"); // Graph-style UTC without Z
const ev = (o = {}) => ({
  id: o.id ?? "e1",
  subject: o.subject ?? "AI Platform sync",
  start: { dateTime: iso(o.start ?? T0 + 12 * 60_000), timeZone: "UTC" },
  end: { dateTime: iso(o.end ?? T0 + 42 * 60_000), timeZone: "UTC" },
  isAllDay: false,
  isCancelled: false,
  showAs: "busy",
  responseStatus: { response: "accepted" },
  attendees: [{ emailAddress: { name: "Laura" } }, { emailAddress: { name: "Misaki" } }],
  organizer: { emailAddress: { name: "Laura" } },
  onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=x" },
  location: { displayName: "Microsoft Teams Meeting" },
  webLink: "https://outlook.office365.com/owa/?itemid=1",
  ...o.raw,
});
const svg = (u) => decodeURIComponent(u.replace(/^data:image\/svg\+xml;charset=utf8,/, ""));

test("normalize parses UTC times and keeps the Teams link", () => {
  const m = normalize(ev());
  assert.equal(m.start, T0 + 12 * 60_000);
  assert.equal(m.join.kind, "Teams");
  assert.match(m.join.app, /^msteams:\/l\/meetup-join\//);
});

test("normalize skips declined, cancelled, all-day, free and personal blocks", () => {
  assert.equal(normalize(ev({ raw: { responseStatus: { response: "declined" } } })), null);
  assert.equal(normalize(ev({ raw: { isCancelled: true } })), null);
  assert.equal(normalize(ev({ raw: { isAllDay: true } })), null);
  assert.equal(normalize(ev({ raw: { showAs: "free" } })), null);
  assert.equal(normalize(ev({ subject: "Focus time", raw: { onlineMeeting: null, attendees: [] } })), null);
  assert.equal(normalize(ev({ raw: { onlineMeeting: null, attendees: [], location: {} } })), null);
});

test("joinInfo finds Zoom links in the body and builds an app URL", () => {
  const j = joinInfo({ bodyPreview: "Join: https://us02web.zoom.us/j/81234567890?pwd=AbC.123 thanks" });
  assert.equal(j.kind, "Zoom");
  assert.equal(j.app, "zoommtg://zoom.us/join?action=join&confno=81234567890&pwd=AbC.123");
  assert.equal(joinInfo({ location: { displayName: "Room 3F" } }), null);
});

test("pick shows the upcoming meeting, or live one, and prefers a meeting starting soon", () => {
  const next = normalize(ev());
  assert.deepEqual([pick([next], T0).mode, pick([next], T0).minutes], ["next", 12]);
  const live = normalize(ev({ id: "live", start: T0 - 20 * 60_000, end: T0 + 10 * 60_000 }));
  assert.equal(pick([live, next], T0).mode, "live");
  const soon = normalize(ev({ id: "soon", start: T0 + 4 * 60_000 }));
  assert.equal(pick([live, soon], T0).meeting.id, "soon");
  assert.equal(pick([], T0).mode, "none");
});

test("urgency and countdown text follow the minutes", () => {
  const m = normalize(ev());
  const at = (mins) => pick([m], m.start - mins * 60_000);
  assert.equal(urgency(at(30)), "far");
  assert.equal(urgency(at(5)), "soon");
  assert.equal(urgency(at(1)), "now");
  assert.equal(countdown(at(12), () => "x"), "in 12 min");
  assert.equal(countdown(at(90), () => "x"), "in 1h 30m");
  assert.equal(countdown(at(400), () => "10:12"), "at 10:12");
  assert.equal(countdown(at(1), () => "x"), "NOW");
});

test("images show the countdown, title, link kind and details", () => {
  const view = pick([normalize(ev())], T0);
  const face = svg(meetingImage(view));
  assert.match(face, /in 12 min/);
  assert.match(face, /AI Platform/);
  assert.match(face, /Teams \d\d:\d\d/);
  assert.match(svg(detailImage(view)), /Misaki/);
  assert.match(svg(meetingImage({ mode: "none" })), /No more/);
  assert.deepEqual(wrap("a b", 13, 3), ["a b"]);
});

test("pkce challenge is the S256 of the verifier; missing config is null", async () => {
  const { createHash } = await import("node:crypto");
  const { verifier, challenge } = pkce();
  assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
  assert.equal(loadConfig("/nonexistent/config.json"), null);
});
