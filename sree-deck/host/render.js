// Plugin key images (SVG or PNG data URIs) -> 288x288 PNG (base64) for the app.
import { Resvg } from "@resvg/resvg-js";

const SIZE = 288;
const cache = new Map();

export async function toPng(dataUri) {
  if (cache.has(dataUri)) return cache.get(dataUri);
  const m = /^data:([^;,]+)(;[^,]*)?,(.*)$/s.exec(dataUri);
  if (!m) throw new Error("not a data URI");
  const [, type, params = "", body] = m;
  const bytes = params.includes("base64") ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body), "utf8");
  let png;
  if (type === "image/svg+xml") {
    const r = new Resvg(bytes, {
      fitTo: { mode: "width", value: SIZE },
      font: { loadSystemFonts: true, defaultFontFamily: "Helvetica Neue", sansSerifFamily: "Helvetica Neue" },
    });
    png = r.render().asPng().toString("base64");
  } else {
    png = bytes.toString("base64"); // already a bitmap; the app scales it
  }
  if (cache.size > 500) cache.clear();
  cache.set(dataUri, png);
  return png;
}
