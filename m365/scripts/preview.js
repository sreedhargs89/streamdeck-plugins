// Renders key states side by side from live calendar data: node scripts/preview.js > preview/keys.svg
import { Session, loadConfig } from "../src/auth.js";
import { upcomingMeetings } from "../src/graph.js";
import { pick } from "../src/meeting.js";
import { meetingImage, detailImage } from "../src/render.js";
const meetings = await upcomingMeetings(new Session(loadConfig()));
const m = pick(meetings).meeting;
const faces = m
  ? [pick(meetings), pick(meetings, m.start - 12 * 60_000), pick(meetings, m.start - 4 * 60_000), pick(meetings, m.start - 30_000), pick(meetings, m.start + 5 * 60_000)].map((v) => meetingImage(v))
  : [meetingImage({ mode: "none" })];
if (m) faces.push(detailImage(pick(meetings)));
let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${faces.length * 164 + 20}" height="184"><rect width="100%" height="100%" fill="#050607"/>`;
faces.forEach((u, i) => (out += `<clipPath id="c${i}"><rect x="${20 + i * 164}" y="20" width="144" height="144" rx="18"/></clipPath><image clip-path="url(#c${i})" x="${20 + i * 164}" y="20" width="144" height="144" href="${u.replace(/&/g, "&amp;")}"/>`));
console.log(out + "</svg>");
