import assert from "node:assert/strict";
import { test } from "node:test";
import { contrast } from "./color.ts";
import { ACCENTS, buildPalette, PRESETS } from "./presets.ts";

// Every combination a user can pick must stay readable (WCAG AA, 4.5:1).
for (const preset of PRESETS) {
  for (const accent of [null, ...ACCENTS.map((a) => a.id)]) {
    for (const solid of [false, true]) {
      const name = `${preset.id} + ${accent ?? "default"}${solid ? " (solid)" : ""}`;
      test(`${name} meets contrast`, () => {
        const p = buildPalette(preset, { accent, solid });
        for (const [label, fg] of [
          ["text", p.text],
          ["textMuted", p.textMuted],
          ["textFaint", p.textFaint],
          ["primary", p.primary],
        ] as const) {
          assert.ok(contrast(fg, p.background) >= 4.5, `${label} on background: ${contrast(fg, p.background).toFixed(2)}`);
          assert.ok(contrast(fg, p.surface) >= 4.5, `${label} on surface: ${contrast(fg, p.surface).toFixed(2)}`);
        }
        assert.ok(contrast(p.onPrimary, p.primary) >= 4.5, `onPrimary: ${contrast(p.onPrimary, p.primary).toFixed(2)}`);
        for (const [type, c] of Object.entries(p.type)) {
          assert.ok(contrast(c, p.background) >= 3, `${type} badge colour on background`);
        }
        assert.equal(p.heat.length, 5);
      });
    }
  }
}

test("Paper and Ink keep their hand-tuned look by default", () => {
  const paper = buildPalette(PRESETS.find((p) => p.id === "paper")!);
  assert.equal(paper.gradient.hero[0], "#2C5A4C");
  assert.equal(paper.glass.intensity, 26);
  const ink = buildPalette(PRESETS.find((p) => p.id === "ink")!);
  assert.equal(ink.glass.tint, "rgba(28,32,29,0.62)");
});

test("solid surfaces drop blur and transparency", () => {
  const p = buildPalette(PRESETS[0], { solid: true });
  assert.equal(p.solid, true);
  assert.equal(p.glass.intensity, 0);
  assert.equal(p.glass.tint, p.surface);
});
