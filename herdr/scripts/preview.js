// Renders the folder as it would look right now from live herdr data: node scripts/preview.js > preview/deck.svg
import { snapshot } from "../src/herdr.js";
import { slotImage, needsImage, moreImage } from "../src/render.js";
const { tabs } = await snapshot();
const W = (t) => ["done", "blocked"].includes(t.status);
const back = `data:image/svg+xml;charset=utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"><rect width="144" height="144" fill="#37474F"/><text x="72" y="88" font-size="48" fill="#fff" text-anchor="middle" font-family="Helvetica">◀</text></svg>')}`;
const keys = [back, needsImage(tabs.filter(W).length, tabs.filter((t) => t.status === "blocked").length)];
for (let i = 0; i < 12; i++) keys.push(slotImage(tabs[i], { flash: false, style: process.env.STYLE }));
keys.push(moreImage(0, Math.ceil(tabs.length / 12), Math.max(0, tabs.length - 12)));
const k = 144, g = 20, p = 30;
let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${p * 2 + k * 5 + g * 4}" height="${p * 2 + k * 3 + g * 2}"><rect width="100%" height="100%" rx="28" fill="#050607"/>`;
keys.forEach((u, i) => {
  const x = p + (i % 5) * (k + g), y = p + Math.floor(i / 5) * (k + g);
  out += `<clipPath id="c${i}"><rect x="${x}" y="${y}" width="${k}" height="${k}" rx="18"/></clipPath><image clip-path="url(#c${i})" x="${x}" y="${y}" width="${k}" height="${k}" href="${u.replace(/&/g, "&amp;")}"/>`;
});
console.log(out + "</svg>");
