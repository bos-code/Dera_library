import assert from "node:assert/strict";
import { test } from "node:test";
import { speechChunks } from "./speechChunks.ts";

test("empty text has no chunks", () => {
  assert.deepEqual(speechChunks("  \n "), []);
});

test("short text is one chunk with whitespace collapsed", () => {
  assert.deepEqual(speechChunks("Hello\n\nworld.  Bye!"), ["Hello world. Bye!"]);
});

test("breaks between sentences and respects the limit", () => {
  const text = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
  const chunks = speechChunks(text, 100);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(c.length <= 100, c);
    assert.match(c, /\.$/);
  }
  assert.equal(chunks.join(" "), text);
});

test("cuts unpunctuated runs at word boundaries", () => {
  const text = Array.from({ length: 200 }, () => "word").join(" ");
  const chunks = speechChunks(text, 50);
  for (const c of chunks) {
    assert.ok(c.length <= 50);
    assert.ok(!c.startsWith(" ") && !c.endsWith(" "));
    assert.ok(c.split(" ").every((w) => w === "word"));
  }
  assert.equal(chunks.join(" "), text);
});
