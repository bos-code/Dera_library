import assert from "node:assert/strict";
import { test } from "node:test";
import { contrast, ensureContrast, mix, parseHex, readableOn, toHex } from "./color.ts";

test("hex round trip and short form", () => {
  assert.equal(toHex(parseHex("#2c5a4c")), "#2C5A4C");
  assert.deepEqual(parseHex("#fff"), [255, 255, 255]);
});

test("mix endpoints and midpoint", () => {
  assert.equal(mix("#000000", "#FFFFFF", 0), "#000000");
  assert.equal(mix("#000000", "#FFFFFF", 1), "#FFFFFF");
  assert.equal(mix("#000000", "#FFFFFF", 0.5), "#808080");
});

test("contrast matches WCAG reference values", () => {
  assert.equal(Math.round(contrast("#000000", "#FFFFFF")), 21);
  assert.equal(contrast("#777777", "#777777"), 1);
});

test("readableOn picks the stronger of black/white", () => {
  assert.equal(readableOn("#FFFFFF"), "#0B0C0B");
  assert.equal(readableOn("#123028"), "#FFFFFF");
});

test("ensureContrast lifts a pale accent to 4.5:1 on paper and on ink", () => {
  const onPaper = ensureContrast("#F5C26B", "#F2EEE6");
  assert.ok(contrast(onPaper, "#F2EEE6") >= 4.5, onPaper);
  const onInk = ensureContrast("#2551C4", "#0D0F0D");
  assert.ok(contrast(onInk, "#0D0F0D") >= 4.5, onInk);
  assert.equal(ensureContrast("#2C5A4C", "#F2EEE6"), "#2C5A4C");
});
