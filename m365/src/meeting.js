// Picks the meeting to show and works out how to join it. Pure functions: easy to test.

const SKIP_SUBJECT = /\b(focus time|focus|lunch|commute|ooo|out of office|block|hold)\b/i;

/** Graph event (with Prefer: outlook.timezone="UTC") -> plain meeting object, or null to skip. */
export function normalize(ev) {
  if (!ev || ev.isCancelled || ev.isAllDay) return null;
  if (ev.responseStatus?.response === "declined") return null;
  if (ev.showAs === "free" || ev.showAs === "oof") return null;
  const subject = (ev.subject || "(no title)").trim();
  const join = joinInfo(ev);
  const attendees = (ev.attendees ?? []).map((a) => a.emailAddress?.name || a.emailAddress?.address).filter(Boolean);
  if (SKIP_SUBJECT.test(subject) && !join) return null;
  if (!attendees.length && !join) return null; // personal calendar blocks
  const utc = (d) => new Date(d.dateTime.endsWith("Z") ? d.dateTime : `${d.dateTime}Z`).getTime();
  return {
    id: ev.id,
    subject,
    start: utc(ev.start),
    end: utc(ev.end),
    join,
    webLink: ev.webLink,
    organizer: ev.organizer?.emailAddress?.name || "",
    attendees,
    location: ev.location?.displayName || "",
  };
}

const TEAMS = /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"'<>)]+/i;
const ZOOM = /https:\/\/[\w.-]*zoom\.us\/j\/(\d+)(\?pwd=[\w.-]+)?/i;
const MEET = /https:\/\/meet\.google\.com\/[a-z0-9-]+/i;
const WEBEX = /https:\/\/[\w.-]+\.webex\.com\/[^\s"'<>)]+/i;

/** Finds the join link in the online meeting info, location or body preview. */
export function joinInfo(ev) {
  const direct = ev.onlineMeeting?.joinUrl || ev.onlineMeetingUrl;
  const haystack = [direct, ev.location?.displayName, ev.bodyPreview, ev.body?.content].filter(Boolean).join(" ");
  let m;
  if ((m = haystack.match(TEAMS))) return { kind: "Teams", url: m[0], app: m[0].replace(/^https:\/\/teams\.microsoft\.com/, "msteams:") };
  if ((m = haystack.match(ZOOM))) {
    const pwd = m[2] ? `&pwd=${m[2].slice(5)}` : "";
    return { kind: "Zoom", url: m[0], app: `zoommtg://zoom.us/join?action=join&confno=${m[1]}${pwd}` };
  }
  if ((m = haystack.match(MEET))) return { kind: "Meet", url: m[0], app: m[0] };
  if ((m = haystack.match(WEBEX))) return { kind: "Webex", url: m[0], app: m[0] };
  if (direct) return { kind: "Online", url: direct, app: direct };
  return null;
}

/**
 * What the key should show at `now`:
 *   { mode: "none" } | { mode: "live", meeting } | { mode: "next", meeting, minutes }
 * A meeting starting within 5 minutes wins over one already in progress.
 */
export function pick(meetings, now = Date.now()) {
  const list = meetings.filter(Boolean).sort((a, b) => a.start - b.start);
  const upcoming = list.find((m) => m.start > now);
  const live = list.filter((m) => m.start <= now && m.end > now).pop();
  const mins = (m) => Math.ceil((m.start - now) / 60_000);
  if (upcoming && (!live || mins(upcoming) <= 5)) return { mode: "next", meeting: upcoming, minutes: mins(upcoming) };
  if (live) return { mode: "live", meeting: live, minutes: Math.ceil((live.end - now) / 60_000) };
  return { mode: "none" };
}

/** Urgency bucket used for colour: far (>5 min), soon (<=5), now (<=1), live. */
export function urgency(view) {
  if (view.mode === "live") return "live";
  if (view.mode !== "next") return "none";
  if (view.minutes <= 1) return "now";
  if (view.minutes <= 5) return "soon";
  return "far";
}

export function countdown(view, fmtTime) {
  if (view.mode === "live") return `LIVE · ${view.minutes}m`;
  if (view.mode !== "next") return "";
  const m = view.minutes;
  if (m <= 1) return "NOW";
  if (m < 60) return `in ${m} min`;
  if (m < 180) return `in ${Math.floor(m / 60)}h ${m % 60}m`;
  return `at ${fmtTime(view.meeting.start)}`;
}
