// Thin client over the herdr CLI: one `api snapshot` per poll gives tabs, agents and focus.
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Optional per-machine config: ~/.config/streamdeck-herdr.json
 *   { "herdr": "/path/to/herdr", "terminal": "iTerm" }
 * Environment variables HERDR_BIN / HERDR_TERMINAL win over the file.
 */
export function loadConfig(home = homedir(), env = process.env) {
  let file = {};
  const path = join(home, ".config/streamdeck-herdr.json");
  if (existsSync(path)) {
    try {
      file = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      file = {};
    }
  }
  const candidates = [env.HERDR_BIN, file.herdr, join(home, ".local/bin/herdr"), "/opt/homebrew/bin/herdr", "/usr/local/bin/herdr"];
  return {
    herdr: candidates.find((p) => p && existsSync(p)) ?? "herdr",
    terminal: env.HERDR_TERMINAL || file.terminal || "Ghostty",
    style: env.HERDR_STYLE || file.style || "tint", // tile style: "tint" (whole tile) or "frame" (border + strip)
  };
}

export const config = loadConfig();
const HERDR = config.herdr;

function run(bin, args, timeout = 3000) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolve(stdout);
    });
  });
}

/** Tabs in herdr order, each with its status and the agent's current task title. */
export async function snapshot() {
  const out = JSON.parse(await run(HERDR, ["api", "snapshot"]));
  const snap = out.result?.snapshot;
  if (!snap) throw new Error("unexpected herdr snapshot");
  const titleByTab = new Map();
  for (const a of snap.agents ?? []) {
    if (!titleByTab.has(a.tab_id)) titleByTab.set(a.tab_id, a.terminal_title_stripped || "");
  }
  const wsOrder = new Map((snap.workspaces ?? []).map((w, i) => [w.workspace_id, i]));
  const tabs = (snap.tabs ?? [])
    .map((t) => ({
      id: t.tab_id,
      label: t.label || `Tab ${t.number}`,
      number: t.number,
      status: t.agent_status || "unknown",
      task: (titleByTab.get(t.tab_id) || "").replace(/^[^\p{L}\p{N}]+/u, ""),
      focused: t.tab_id === snap.focused_tab_id,
      ws: wsOrder.get(t.workspace_id) ?? 0,
    }))
    .sort((a, b) => a.ws - b.ws || a.number - b.number);
  return { tabs, focusedTab: snap.focused_tab_id };
}

/** Switch herdr to the tab and bring the terminal that runs herdr to the front. */
export async function focusTab(tabId) {
  await run(HERDR, ["tab", "focus", tabId]);
  await run("/usr/bin/open", ["-a", config.terminal]);
}
