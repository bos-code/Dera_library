import assert from "node:assert/strict";
import { test } from "node:test";
import { suggest } from "./suggest.ts";

const cols = [
  { id: "physics", name: "Physics" },
  { id: "maths", name: "Mathematics" },
  { id: "finance", name: "Finance" },
  { id: "react-native", name: "React Native" },
];

test("collection names found in the file name are suggested", () => {
  const s = suggest({ name: "physics_week3_notes.pdf", folder: "Download" }, cols, new Map());
  assert.deepEqual(
    s.map((x) => [x.id, x.reason]),
    [["physics", "name"]],
  );
});

test("multi-word names need every word", () => {
  assert.deepEqual(
    suggest({ name: "react-native-guide.epub", folder: null }, cols, new Map()).map((x) => x.id),
    ["react-native"],
  );
  assert.deepEqual(
    suggest({ name: "react-hooks.pdf", folder: null }, cols, new Map()).map((x) => x.id),
    [],
  );
});

test("filing habits for the folder are suggested and ranked", () => {
  const s = suggest(
    { name: "invoice-0042.pdf", folder: "WhatsApp/Media/WhatsApp Documents" },
    cols,
    new Map([
      ["finance", 4],
      ["maths", 1],
    ]),
  );
  assert.deepEqual(
    s.map((x) => [x.id, x.reason]),
    [
      ["finance", "folder"],
      ["maths", "folder"],
    ],
  );
});

test("accents and case don't matter; nothing irrelevant is suggested", () => {
  assert.deepEqual(
    suggest({ name: "MATHÉMATICS revision.docx", folder: null }, cols, new Map()).map((x) => x.id),
    ["maths"],
  );
  assert.deepEqual(suggest({ name: "holiday photos.pdf", folder: "Pictures" }, cols, new Map()), []);
});
