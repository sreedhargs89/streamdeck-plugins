import { test } from "node:test";
import assert from "node:assert/strict";
import { wrap, themeFor, displayName, slotImage, needsImage, moreImage, peekImage } from "../src/render.js";
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
  const s = svg(slotImage({ label: "a<b>&c", status: "blocked", focused: true }));
  assert.match(s, /#FF1744/);
  assert.match(s, /stroke-width="5"/);
  assert.match(s, /A&lt;b&gt;&amp;c/);
  assert.doesNotMatch(svg(slotImage(undefined)), /<text/);
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
