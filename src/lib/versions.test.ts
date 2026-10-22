import assert from "node:assert/strict";
import { test } from "node:test";
import { stackVersions, versionKey } from "./versions.ts";

test("version names share a key; plain names don't get one", () => {
  const k = versionKey("Report v2.docx", "docx");
  assert.ok(k);
  for (const n of ["Report final.docx", "report-v3.docx", "Report (1).docx", "Report draft 2.docx", "Report - Copy.docx"]) {
    assert.equal(versionKey(n, "docx"), k, n);
  }
  assert.equal(versionKey("Report final.pdf", "pdf"), k, "PDF export of the same report");
  assert.equal(versionKey("Quarterly report.docx", "docx"), null);
  assert.equal(versionKey("Chapter 1.pdf", "pdf"), null, "numbered chapters aren't versions");
  assert.notEqual(versionKey("Budget v1.xlsx", "xlsx"), versionKey("Budget v1.docx", "docx"));
});

test("stacks collapse to the newest version and expand on demand", () => {
  const docs = [
    { id: 1, name: "Report v1.docx", extension: "docx", modifiedAt: 10 },
    { id: 2, name: "Notes.pdf", extension: "pdf", modifiedAt: 50 },
    { id: 3, name: "Report final.docx", extension: "docx", modifiedAt: 30 },
    { id: 4, name: "Report v2.docx", extension: "docx", modifiedAt: 20 },
  ];
  const collapsed = stackVersions(docs, new Set());
  assert.deepEqual(
    collapsed.map((d) => d.id),
    [2, 3],
  );
  assert.deepEqual(collapsed[1].stack && { count: collapsed[1].stack.count, head: collapsed[1].stack.head }, {
    count: 3,
    head: true,
  });
  const key = collapsed[1].stack!.key;
  assert.deepEqual(
    stackVersions(docs, new Set([key])).map((d) => d.id),
    [1, 2, 3, 4],
  );
});
