import assert from "node:assert/strict";
import { test } from "node:test";
import { displayTitle } from "./title.ts";

const cases: Array<[string, string]> = [
  ["Physics_Notes_v2 (1).pdf", "Physics Notes v2"],
  ["Annual Report - Copy.docx", "Annual Report"],
  ["Annual Report - Copy (2).docx", "Annual Report"],
  ["react-native-guide.epub", "react native guide"],
  ["chapter.one.notes.txt", "chapter one notes"],
  ["Invoice 2024-05-10.pdf", "Invoice 2024-05-10"],
  ["2024-05-10.pdf", "2024-05-10"],
  ["spec v2.1.md", "spec v2.1"],
  ["DOC-20240512-WA0003.pdf", "DOC-20240512-WA0003"],
  ["  spaced   out .pdf", "spaced out"],
  [".pdf", ".pdf"],
  ["README", "README"],
];

for (const [input, expected] of cases) {
  test(`displayTitle(${JSON.stringify(input)})`, () => assert.equal(displayTitle(input), expected));
}
