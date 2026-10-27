import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("actual generated public worker never substitutes theme HTML for native login/admin routes", () => {
  const worker = readFileSync(new URL("../dist/sw.js", import.meta.url), "utf8");
  assert.doesNotMatch(worker, /["']index\.html["']/);
  assert.doesNotMatch(worker, /createHandlerBoundToURL|NavigationRoute/);
  assert.match(worker, /precacheAndRoute/, "public static asset caching remains enabled");
});
