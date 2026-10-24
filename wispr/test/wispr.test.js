import { test } from "node:test";
import assert from "node:assert/strict";
import { toCodes, LINKS } from "../src/wispr.js";

test("key names map to the macOS codes Wispr stores", () => {
  assert.equal(toCodes("opt+1"), "58+18"); // Wispr: polish "18+58"
  assert.equal(toCodes("opt+s"), "58+1"); // open_scratchpad "1+58"
  assert.equal(toCodes("fn"), "63"); // push-to-talk
  assert.equal(toCodes("ctrl+fn"), "59+63"); // lens
  assert.equal(toCodes("fn+p"), "63+35"); // paste last
  assert.equal(toCodes("fn+space"), "63+49"); // hands-free
  assert.equal(toCodes("opt+o"), "58+31"); // view diff
  assert.equal(toCodes("58+18"), "58+18");
  assert.throws(() => toCodes("hyper+x"), /unknown key/);
});

test("deep links are Wispr's own", () => {
  assert.equal(LINKS["start-hands-free"], "wispr-flow://start-hands-free");
});
