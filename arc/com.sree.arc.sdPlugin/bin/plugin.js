// Arc Spaces: Stream Deck SDK v3 plugin without dependencies (Node's built-in WebSocket + osascript).
import { execFile } from "node:child_process";
import { focusScript } from "./arc.js";

const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const ws = new WebSocket(`ws://127.0.0.1:${arg("-port")}`);
const send = (msg) => ws.send(JSON.stringify(msg));

ws.onopen = () => send({ event: arg("-registerEvent"), uuid: arg("-pluginUUID") });
ws.onmessage = ({ data }) => {
  const m = JSON.parse(data);
  if (m.event !== "keyUp" || m.action !== "com.sree.arc.space") return;
  const space = m.payload.settings?.space;
  if (!space) return send({ event: "showAlert", context: m.context });
  execFile("/usr/bin/osascript", ["-e", focusScript(space)], (err) =>
    send({ event: err ? "showAlert" : "showOk", context: m.context }));
};
