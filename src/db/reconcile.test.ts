import assert from "node:assert/strict";
import { test } from "node:test";
import type { ScannedItem } from "../native/scanner";
import { planReconcile, type IndexedDoc } from "./reconcile.ts";

let nextId = 1;
const T = 1_700_000_000_000;

function item(name: string, over: Partial<ScannedItem> = {}): ScannedItem {
  const path = over.path === undefined ? `/storage/emulated/0/Documents/${name}` : over.path;
  return {
    uri: path ? `file://${path}` : `content://x/${name}`,
    path,
    name,
    extension: name.split(".").pop() ?? "",
    mimeType: "application/pdf",
    size: 1000,
    modifiedAt: T,
    folder: "Documents",
    ...over,
  };
}

function doc(i: ScannedItem, over: Partial<IndexedDoc> = {}): IndexedDoc {
  return {
    id: nextId++,
    uri: i.uri,
    path: i.path,
    name: i.name,
    extension: i.extension,
    size: i.size,
    modifiedAt: i.modifiedAt,
    sourceId: "device",
    status: "available",
    ...over,
  };
}

test("new documents are inserted, known ones updated", () => {
  const a = item("a.pdf");
  const existing = [doc(a)];
  const plan = planReconcile(existing, { sourceId: "device", items: [{ ...a, size: 2000 }, item("b.pdf")] });
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0].name, "b.pdf");
  assert.deepEqual(
    plan.updates.map((u) => u.id),
    [existing[0].id],
  );
  assert.equal(plan.summary.updated, 1);
  assert.equal(plan.markMissing.length, 0);
});

test("a disappeared document is marked missing, never removed", () => {
  const docs = [item("a.pdf"), item("b.pdf"), item("c.pdf")].map((i) => doc(i));
  const plan = planReconcile(docs, { sourceId: "device", items: [item("a.pdf"), item("b.pdf")] });
  assert.deepEqual(plan.markMissing, [docs[2].id]);
  assert.equal(plan.summary.missing, 1);
});

test("an empty scan never marks the library missing", () => {
  const docs = [doc(item("a.pdf")), doc(item("b.pdf"))];
  const plan = planReconcile(docs, { sourceId: "device", items: [] });
  assert.equal(plan.markMissing.length, 0);
  assert.equal(plan.summary.skipped, true);
  assert.ok(plan.summary.warning);
});

test("a scan that loses most documents is held back unless forced", () => {
  const items = Array.from({ length: 20 }, (_, i) => item(`f${i}.pdf`));
  const docs = items.map((i) => doc(i));
  const partial = items.slice(0, 5);
  assert.equal(planReconcile(docs, { sourceId: "device", items: partial }).markMissing.length, 0);
  assert.equal(planReconcile(docs, { sourceId: "device", items: partial, force: true }).markMissing.length, 15);
});

test("a moved file is relinked to the same row, keeping its organization", () => {
  const old = doc(item("notes.pdf", { path: "/storage/emulated/0/Download/notes.pdf" }));
  const moved = item("notes.pdf", { path: "/storage/emulated/0/School/notes.pdf" });
  const plan = planReconcile([old], { sourceId: "device", items: [moved] });
  assert.equal(plan.inserts.length, 0);
  assert.deepEqual(plan.updates, [{ id: old.id, item: moved }]);
  assert.equal(plan.summary.relinked, 1);
  assert.equal(plan.markMissing.length, 0);
});

test("a renamed file is relinked by size + mtime + extension", () => {
  const old = doc(item("draft.docx", { size: 4242 }));
  const renamed = item("final.docx", { size: 4242 });
  const plan = planReconcile([old], { sourceId: "device", items: [renamed] });
  assert.equal(plan.summary.relinked, 1);
  assert.equal(plan.updates[0].id, old.id);
});

test("ambiguous rename candidates are not guessed", () => {
  const a = doc(item("a.pdf"));
  const b = doc(item("b.pdf"));
  const plan = planReconcile([a, b], { sourceId: "device", items: [item("c.pdf")], force: true });
  assert.equal(plan.summary.relinked, 0);
  assert.equal(plan.inserts.length, 1);
});

test("a missing document that reappears is restored", () => {
  const a = item("a.pdf");
  const existing = [doc(a, { status: "missing" })];
  const plan = planReconcile(existing, { sourceId: "device", items: [a] });
  assert.equal(plan.summary.restored, 1);
  assert.equal(plan.inserts.length, 0);
});

test("duplicate sightings of the same path are collapsed", () => {
  const a = item("a.pdf");
  const plan = planReconcile([], { sourceId: "device", items: [a, { ...a, uri: "content://media/external/file/9" }] });
  assert.equal(plan.inserts.length, 1);
});

test("a folder source does not steal or duplicate a file the device scan owns", () => {
  const a = item("a.pdf");
  const owned = doc(a);
  const viaSaf = { ...a, uri: "content://com.android.externalstorage.documents/tree/x/document/primary%3ADocuments%2Fa.pdf" };
  const plan = planReconcile([owned], { sourceId: "src_1", items: [viaSaf] });
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.updates.length, 0);
});

test("a folder source takes over a file the device can no longer reach", () => {
  const a = item("a.pdf");
  const revoked = doc(a, { status: "revoked" });
  const viaSaf = { ...a, uri: "content://com.android.externalstorage.documents/document/primary%3ADocuments%2Fa.pdf" };
  const plan = planReconcile([revoked], { sourceId: "src_1", items: [viaSaf] });
  assert.deepEqual(
    plan.updates.map((u) => u.id),
    [revoked.id],
  );
  assert.equal(plan.summary.restored, 1);
});

test("losing all-files access marks file:// documents revoked, not missing", () => {
  const docs = [doc(item("a.pdf")), doc(item("b.pdf"))];
  const plan = planReconcile(docs, { sourceId: "device", items: [item("a.pdf")], deviceMode: "mediastore" });
  assert.deepEqual(plan.markRevoked, [docs[1].id]);
  assert.equal(plan.markMissing.length, 0);
});

test("documents of other scopes are untouched", () => {
  const other = doc(item("x.pdf"), { sourceId: "src_2" });
  const plan = planReconcile([other], { sourceId: "device", items: [item("y.pdf")] });
  assert.equal(plan.markMissing.length, 0);
  assert.equal(plan.inserts.length, 1);
});
