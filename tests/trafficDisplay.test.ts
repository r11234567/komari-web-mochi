import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { formatTrafficGB } from "../src/utils/trafficDisplay.ts";

test("reported calibrated totals use the same provider GB in every layout", () => {
  assert.equal(formatTrafficGB(70_450_000_000), "70.45 GB");
  assert.equal(formatTrafficGB(60_560_000_000), "60.56 GB");
  assert.equal(formatTrafficGB(131_020_000_000), "131.02 GB");
  assert.equal(formatTrafficGB(131_020_000_000, true), "131.02GB");
  assert.equal(formatTrafficGB(131_020_000_000, false, 1), "131.02 GB");
  assert.equal(formatTrafficGB(590_558_003_200), "590.56 GB");
});
test("cards, tables, summaries and details use traffic formatting for totals", () => {
  for (const name of ["Node", "NodeCompactCard", "NodeModernCardDynamic", "NodeTable", "DesktopDetailsCard", "MobileDetailsCard", "DetailsGrid", "StatusBar", "TaskDisplay"]) {
    const source = readFileSync(new URL(`../src/components/${name}.tsx`, import.meta.url), "utf8");
    assert.match(source, /import \{ formatTrafficGB \}/, name);
    assert.doesNotMatch(source, /formatBytes\([^)]*(totalUp|totalDown|trafficInfo\.(usage|limit)|trafficStats\.usage|traffic_limit|trafficUsage|uploadTotal|downloadTotal)/, name);
  }
});
