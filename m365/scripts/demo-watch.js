// Prints a line each time the Next Meeting key changes stage, and saves that face to preview/demo/.
import { writeFileSync } from "node:fs";
import { Session, loadConfig } from "../src/auth.js";
import { upcomingMeetings } from "../src/graph.js";
import { pick, urgency, countdown } from "../src/meeting.js";
import { meetingImage, detailImage, fmtTime } from "../src/render.js";
const session = new Session(loadConfig());
const until = Date.parse(process.argv[2]);
let meetings = await upcomingMeetings(session), last = null, n = 0;
setInterval(async () => { try { meetings = await upcomingMeetings(session); } catch {} }, 60_000);
const save = (name, uri) => writeFileSync(`preview/demo/${name}.svg`, decodeURIComponent(uri.replace(/^data:image\/svg\+xml;charset=utf8,/, "")));
const tick = () => {
  const v = pick(meetings);
  const stage = `${urgency(v)}|${v.meeting?.id ?? ""}`;
  if (stage !== last) {
    last = stage;
    const name = `${String(++n).padStart(2, "0")}-${urgency(v)}`;
    save(name, meetingImage(v));
    if (n === 1) save("00-longpress", detailImage(v));
    console.log(`${fmtTime(Date.now())}  ${urgency(v).toUpperCase().padEnd(5)}  "${countdown(v, fmtTime)}"  ${v.meeting?.subject ?? "-"}`);
  }
  if (Date.now() > until) process.exit(0);
};
tick();
setInterval(tick, 2000);
