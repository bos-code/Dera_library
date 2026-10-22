/**
 * Splits text into pieces the speech engine accepts (Android caps one utterance at ~4000 characters), breaking
 * at sentence ends where possible so pausing and skipping land on natural boundaries.
 */
export function speechChunks(text: string, max = 1200): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)\s*/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const sentence of sentences) {
    if (sentence.length > max) {
      push();
      // A run-on "sentence" (tables, lists without punctuation): cut at word boundaries.
      let rest = sentence;
      while (rest.length > max) {
        const cut = rest.lastIndexOf(" ", max);
        const at = cut > max / 2 ? cut : max;
        chunks.push(rest.slice(0, at).trim());
        rest = rest.slice(at);
      }
      current = rest;
    } else if (current.length + sentence.length > max) {
      push();
      current = sentence;
    } else current += sentence;
  }
  push();
  return chunks;
}
