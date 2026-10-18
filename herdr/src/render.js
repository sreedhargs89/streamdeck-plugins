// SVG key images (144x144). Emoji are pre-rendered PNGs embedded as data URIs,
// because the Stream Deck SVG renderer does not draw colour emoji fonts.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// bundled: <plugin>/bin/plugin.js -> ../imgs/emoji; from source (tests, preview): src/ -> ../com.sree.herdr.sdPlugin/imgs/emoji
const HERE = dirname(fileURLToPath(import.meta.url));
const EMOJI_DIR = [join(HERE, "../imgs/emoji"), join(HERE, "../com.sree.herdr.sdPlugin/imgs/emoji")].find(existsSync) ?? "";
const emojiCache = new Map();
function emoji(name) {
  if (!emojiCache.has(name)) {
    const f = join(EMOJI_DIR, `${name}.png`);
    emojiCache.set(name, existsSync(f) ? `data:image/png;base64,${readFileSync(f).toString("base64")}` : null);
  }
  return emojiCache.get(name);
}

const GROUPS = {
  ops: ["#0B4F8A", "#1E88E5"],
  avyukt: ["#4A148C", "#8E24AA"],
  personal: ["#1B5E20", "#43A047"],
  other: ["#004D40", "#00897B"],
  empty: ["#101316", "#15191d"],
  flash: ["#F9A825", "#FFEE58"],
};

// first match wins: [pattern, emoji file, group]
const THEMES = [
  [/avyukt.*(official|admin|finance)/, "briefcase", "avyukt"],
  [/avyukt.*(tech|dev)/, "gear", "avyukt"],
  [/avyukt|apl|site|web/, "globe", "avyukt"],
  [/ticket/, "ticket", "ops"],
  [/it.?op/, "tools", "ops"],
  [/sharepoint|onedrive|migration/, "folder", "ops"],
  [/ai.?platform|agent|llm|claude/, "robot", "ops"],
  [/power.?bi|report|dashboard/, "chart", "ops"],
  [/amazon|aws|quick/, "cloud", "ops"],
  [/immutable|storage|backup|lock/, "lock", "ops"],
  [/entra|intune|defender|security|azure/, "shield", "ops"],
  [/kite|zerodha|trade|stock/, "stocks", "personal"],
  [/experiment|test|lab|poc/, "lab", "personal"],
  [/elgato|stream.?deck/, "controls", "personal"],
  [/whatsapp|chat|slack|teams/, "speech", "personal"],
  [/^sre$|sree|personal|home/, "compass", "personal"],
];

// shorter display names for long tab labels
const ALIASES = [[/avyuktaiverse/gi, "Avyukt"], [/\b(it|apl|ai|aws|poc|bi)\b/gi, (m) => m.toUpperCase()], [/powerbi/gi, "Power BI"]];

export function displayName(label) {
  let n = label;
  for (const [re, to] of ALIASES) n = n.replace(re, to);
  n = n.replace(/[-_]+/g, " ").trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export function themeFor(label) {
  const l = label.toLowerCase();
  for (const [re, e, g] of THEMES) if (re.test(l)) return { emoji: e, group: g };
  return { emoji: null, group: "other" };
}

const DOT = { working: "#00E676", done: "#FFD600", blocked: "#FF1744", idle: "#90A4AE", unknown: "#546E7A" };

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Split text into at most `max` lines of roughly `width` chars, ellipsising the rest. */
export function wrap(text, width, max) {
  const words = text.trim().split(/\s+/).flatMap((w) => (w.length > width ? w.match(new RegExp(`.{1,${width}}`, "g")) : [w]));
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

function frame([c1, c2], inner, border = "") {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
    `<rect width="144" height="144" fill="url(#g)"/>${border}${inner}</svg>`
  );
}

function textLines(lines, { y, size, color = "#fff", weight = 700, gap = 1.15 }) {
  return lines
    .map((l, i) => `<text x="72" y="${y + i * size * gap}" font-family="Helvetica Neue, Helvetica, Arial" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="middle">${esc(l)}</text>`)
    .join("");
}

const uri = (svg) => `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;

export function slotImage(tab, { flash = false } = {}) {
  if (!tab) return uri(frame(GROUPS.empty, ""));
  const t = themeFor(tab.label);
  const lines = wrap(displayName(tab.label), 11, 2);
  const img = emoji(t.emoji);
  const icon = img
    ? `<image x="44" y="${lines.length > 1 ? 14 : 22}" width="56" height="56" xlink:href="${img}" href="${img}"/>`
    : textLines([">_"], { y: lines.length > 1 ? 62 : 70, size: 40, weight: 800 });
  const ty = lines.length > 1 ? 100 : 112;
  const dot = `<circle cx="122" cy="22" r="12" fill="${DOT[tab.status] ?? DOT.unknown}" stroke="#000" stroke-opacity=".45" stroke-width="3"/>`;
  const focus = tab.focused ? `<rect x="3" y="3" width="138" height="138" rx="10" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="5"/>` : "";
  const textColor = flash ? "#212121" : "#fff";
  return uri(frame(flash ? GROUPS.flash : GROUPS[t.group], icon + textLines(lines, { y: ty, size: 22, color: textColor }) + dot, focus));
}

export function peekImage(tab) {
  if (!tab) return uri(frame(GROUPS.empty, ""));
  const lines = wrap(tab.task || "(no task title)", 15, 6);
  const head = textLines([displayName(tab.label).slice(0, 14)], { y: 24, size: 17, color: "#FFD600" });
  return uri(frame(["#000", "#1c1f24"], head + textLines(lines, { y: 50, size: 16, weight: 600, gap: 1.22 })));
}

export function needsImage(waiting, blocked) {
  const colors = blocked ? ["#B71C1C", "#FF1744"] : waiting ? ["#E65100", "#FF9800"] : ["#263238", "#455A64"];
  const big = waiting ? String(waiting) : "✓";
  const sub = blocked ? `${blocked} blocked` : waiting ? "Needs me" : "All clear";
  return uri(frame(colors, textLines([big], { y: 82, size: 64, weight: 800 }) + textLines([sub], { y: 122, size: 20 })));
}

export function moreImage(page, pages, remaining) {
  if (pages <= 1) return uri(frame(GROUPS.empty, textLines(["More"], { y: 80, size: 20, color: "#455A64" })));
  return uri(
    frame(["#263238", "#546E7A"], textLines(["More ▶"], { y: 62, size: 24 }) + textLines([`+${remaining}`], { y: 96, size: 26, color: "#FFD600", weight: 800 }) + textLines([`page ${page + 1}/${pages}`], { y: 126, size: 16, weight: 500 }))
  );
}

export function messageImage(lines) {
  return uri(frame(["#263238", "#37474F"], textLines(lines, { y: 66, size: 20 })));
}
