// SVG key faces (144x144) for the Next Meeting key.
import { countdown, urgency } from "./meeting.js";

const COLORS = {
  far: ["#0B4F8A", "#1E88E5"],
  soon: ["#E65100", "#FF9800"],
  now: ["#B71C1C", "#FF1744"],
  nowOff: ["#4A0D0D", "#7F1D1D"],
  live: ["#1B5E20", "#43A047"],
  none: ["#263238", "#455A64"],
  signin: ["#004D40", "#00897B"],
  peek: ["#000000", "#1c1f24"],
  error: ["#3E2723", "#5D4037"],
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function wrap(text, width, max) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).flatMap((w) => (w.length > width ? w.match(new RegExp(`.{1,${width}}`, "g")) : [w]));
  const lines = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + " " + w).length <= width) lines[lines.length - 1] = last + " " + w;
    else lines.push(w);
  }
  if (lines.length > max) {
    lines.length = max;
    lines[max - 1] = lines[max - 1].slice(0, width - 1) + "…";
  }
  return lines;
}

const text = (lines, { y, size, color = "#fff", weight = 700, gap = 1.18 }) =>
  lines
    .map((l, i) => `<text x="72" y="${y + i * size * gap}" font-family="Helvetica Neue, Helvetica, Arial" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="middle">${esc(l)}</text>`)
    .join("");

function face([c1, c2], inner) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
    `<rect width="144" height="144" fill="url(#g)"/>${inner}</svg>`;
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

export const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/** Main face. `blink` toggles the flashing red state at <=1 min. */
export function meetingImage(view, { blink = false } = {}) {
  const u = urgency(view);
  if (u === "none") return face(COLORS.none, text(["✓"], { y: 66, size: 48 }) + text(["No more", "meetings"], { y: 100, size: 18, weight: 600 }));
  const m = view.meeting;
  const colors = u === "now" && blink ? COLORS.nowOff : COLORS[u];
  const label = countdown(view, fmtTime);
  const head = text([label], { y: 40, size: u === "now" ? 40 : label.length <= 6 ? 34 : label.length <= 8 ? 30 : 25, weight: 800, color: u === "soon" ? "#1a1a1a" : "#fff" });
  const title = text(wrap(m.subject.replace(/^\[[^\]]*\]\s*/, ""), 11, 2), { y: 74, size: 20, weight: 700 });
  const foot = `${m.join ? m.join.kind : "No link"} ${fmtTime(m.start)}`;
  return face(colors, head + title + `<rect x="0" y="112" width="144" height="32" fill="#000" fill-opacity=".3"/>` + text([foot], { y: 135, size: 19, weight: 700 }));
}

/** Long-press details. */
export function detailImage(view) {
  if (view.mode === "none") return face(COLORS.peek, text(["Nothing in", "the next 24 h"], { y: 66, size: 18 }));
  const m = view.meeting;
  const lines = [
    `${fmtTime(m.start)}–${fmtTime(m.end)}`,
    ...(m.organizer ? [`by ${m.organizer}`] : []),
    ...m.attendees.slice(0, 3),
    ...(m.attendees.length > 3 ? [`+${m.attendees.length - 3} more`] : []),
    ...(m.location && !/^https?:/.test(m.location) ? [m.location] : []),
  ].flatMap((l) => wrap(l, 16, 1));
  return face(COLORS.peek, text(lines.slice(0, 7), { y: 22, size: 15, weight: 600, gap: 1.2 }));
}

export function signinImage(busy = false) {
  return face(COLORS.signin, text(busy ? ["Signing in…", "check browser"] : ["Next Meeting", "Press to", "sign in"], { y: busy ? 66 : 54, size: 18, weight: 700 }));
}

export function setupImage() {
  return face(COLORS.error, text(["Setup", "needed:", "npm run", "login"], { y: 36, size: 18 }));
}

export function errorImage(msg) {
  return face(COLORS.error, text(["Calendar", "offline"], { y: 50, size: 19 }) + text(wrap(msg, 16, 2), { y: 104, size: 13, weight: 500 }));
}
