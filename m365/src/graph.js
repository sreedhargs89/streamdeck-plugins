// Microsoft Graph calls for the Next Meeting key.
import { normalize } from "./meeting.js";

const SELECT = "id,subject,start,end,isAllDay,isCancelled,showAs,responseStatus,onlineMeeting,onlineMeetingUrl,location,organizer,attendees,webLink,bodyPreview";

async function get(session, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${await session.token()}`, Prefer: 'outlook.timezone="UTC"' },
  });
  if (res.status === 401) session.forget();
  if (!res.ok) throw new Error(`Graph ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Meetings from 3 h ago to 24 h ahead, already filtered. */
export async function upcomingMeetings(session, now = Date.now()) {
  const start = new Date(now - 3 * 3600_000).toISOString();
  const end = new Date(now + 24 * 3600_000).toISOString();
  const q = new URLSearchParams({ startDateTime: start, endDateTime: end, $select: SELECT, $orderby: "start/dateTime", $top: "50" });
  const body = await get(session, `/me/calendarView?${q}`);
  return (body.value ?? []).map(normalize).filter(Boolean);
}

/** Full body for one event, to find a join link that is not in the preview (e.g. a Zoom link far down). */
export async function eventBody(session, id) {
  const body = await get(session, `/me/events/${encodeURIComponent(id)}?$select=body,location,onlineMeeting,onlineMeetingUrl`);
  return body;
}
