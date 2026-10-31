import { test } from "node:test";
import assert from "node:assert/strict";
import { quote, focusScript } from "../com.sree.arc.sdPlugin/bin/arc.js";

test("quote escapes quotes and backslashes", () => {
  assert.equal(quote('a"b\\c'), 'a\\"b\\\\c');
});
test("focusScript targets the named space", () => {
  assert.match(focusScript("tech-user@avyuktaiverse.com"), /tell space "tech-user@avyuktaiverse\.com" to focus/);
});
