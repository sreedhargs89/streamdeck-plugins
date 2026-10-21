import { test } from "node:test";
import assert from "node:assert/strict";
import { wrap, themeFor, displayName, doneLabel, slotImage, needsImage, moreImage, peekImage } from "../src/render.js";
import { snapshot } from "../src/herdr.js";

const svg = (u) => decodeURIComponent(u.replace(/^data:image\/svg\+xml;charset=utf8,/, ""));

test("wrap keeps short labels on one line", () => {
  assert.deepEqual(wrap("IT Operations", 11, 2), ["IT", "Operations"]);
  assert.deepEqual(wrap("kite", 11, 2), ["kite"]);
});

test("wrap ellipsises overflow and splits long words", () => {
  const l = wrap("avyuktaiverse-technical repository work", 11, 2);
  assert.equal(l.length, 2);
  assert.ok(l[1].endsWith("…"));
  assert.ok(l.every((x) => x.length <= 11));
});

test("display names are short and readable", () => {
  assert.equal(displayName("avyuktaiverse-official"), "Avyukt official");
  assert.equal(displayName("it-ticket-quick"), "IT ticket quick");
  assert.equal(displayName("apl-site"), "APL site");
  assert.equal(displayName("Powerbi"), "Power BI");
  assert.equal(displayName("Sharepoint migration"), "Sharepoint migration");
});

test("slot image embeds the emoji png", () => {
  assert.match(svg(slotImage({ label: "kite", status: "idle" })), /data:image\/png;base64,/);
});

test("themes map known tabs to groups", () => {
  assert.equal(themeFor("avyuktaiverse-official").group, "avyukt");
  assert.equal(themeFor("avyuktaiverse-technical").emoji, "gear");
  assert.equal(themeFor("IT Operations").emoji, "tools");
  assert.equal(themeFor("it-ticket-quick").emoji, "ticket");
  assert.equal(themeFor("kite").group, "personal");
  assert.equal(themeFor("something new").group, "other");
});

test("slot image shows status colour, focus ring and escapes labels", () => {
  const s = svg(slotImage({ label: "a<b>&c", status: "blocked", focused: true }, { style: "frame" }));
  assert.match(s, /#FF1744/);
  assert.match(s, /NEEDS YOU/);
  assert.match(s, /stroke-dasharray/);
  assert.match(s, /A&lt;b&gt;&amp;c/);
  assert.doesNotMatch(svg(slotImage(undefined)), /<text/);
});

test("status tiles share one base colour and differ by frame + label", () => {
  const run = svg(slotImage({ label: "AI Platform", status: "working" }, { style: "frame" }));
  assert.match(run, /#300a24/);
  assert.match(run, /#40C4FF/);
  assert.match(svg(slotImage({ label: "AI Platform", status: "working" }, { style: "frame", pulse: 1 })), /#1565C0/);
  assert.match(run, /RUNNING/);
  const idle = svg(slotImage({ label: "AI Platform", status: "idle" }, { style: "frame" }));
  assert.match(idle, /#300a24/);
  assert.match(idle, />idle</);
  assert.doesNotMatch(idle, /stroke-width="7"/);
  const now = Date.parse("2026-10-20T10:00:00Z");
  const done = svg(slotImage({ label: "x", status: "done" }, { style: "frame", doneSince: now - 125_000, now }));
  assert.match(done, /✓ DONE · 2m/);
  assert.match(done, /#00E676/);
  assert.equal(doneLabel(0), "✓ DONE");
  assert.equal(doneLabel(now - 2 * 3600_000, now), "✓ DONE · 2h");
});

test("tint style colours the whole tile by status", () => {
  const run = svg(slotImage({ label: "AI Platform", status: "working" }, { style: "tint" }));
  assert.match(run, /#0a2d4a/);
  assert.match(run, /RUNNING/);
  const idle = svg(slotImage({ label: "AI Platform", status: "idle" }, { style: "tint" }));
  assert.match(idle, /#300a24/);
  assert.doesNotMatch(idle, /RUNNING|NEEDS/);
});

test("needs / more / peek images reflect counts", () => {
  assert.match(svg(needsImage(0, 0)), /All clear/);
  assert.match(svg(needsImage(3, 1)), /1 blocked/);
  assert.match(svg(moreImage(0, 2, 2)), /\+2/);
  assert.match(svg(moreImage(0, 1, 0)), /#455A64/);
  assert.match(svg(peekImage({ label: "x", task: "Sharepoint Admin role" })), /Sharepoint/);
});

test("live herdr snapshot parses into ordered tabs", { skip: process.env.CI ? "no herdr in CI" : false }, async () => {
  const { tabs } = await snapshot();
  assert.ok(tabs.length > 0);
  for (const t of tabs) {
    assert.ok(t.id && t.label);
    assert.ok(["idle", "working", "done", "blocked", "unknown"].includes(t.status), t.status);
  }
  const nums = tabs.map((t) => t.number);
  assert.deepEqual(nums, [...nums].sort((a, b) => a - b));
});

test("config falls back to defaults and honours env overrides", async () => {
  const { loadConfig } = await import("../src/herdr.js");
  const none = loadConfig("/nonexistent-home", {});
  assert.equal(none.terminal, "Ghostty");
  const env = loadConfig("/nonexistent-home", { HERDR_TERMINAL: "iTerm", HERDR_BIN: "/bin/sh" });
  assert.equal(env.terminal, "iTerm");
  assert.equal(env.herdr, "/bin/sh");
});

test("tabs group by status (needs you, running, done, idle) and keep herdr order inside a group", async () => {
  const { orderTabs, keepOrder } = await import("../src/herdr.js");
  const t = (id, status) => ({ id, status });
  const tabs = [t("a", "idle"), t("b", "working"), t("c", "done"), t("d", "blocked"), t("e", "working"), t("f", "idle")];
  assert.deepEqual(orderTabs(tabs).map((x) => x.id), ["d", "b", "e", "c", "a", "f"]);
  assert.deepEqual(orderTabs(tabs, new Set(["f"])).map((x) => x.id), ["d", "b", "e", "c", "f", "a"]);
  assert.deepEqual(keepOrder([t("a"), t("b"), t("z")], ["b", "gone", "a"]).map((x) => x.id), ["b", "a", "z"]);
});
