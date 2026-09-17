/** Extract a JSON object from model output (fences, trailing commas, truncation). */
export function parseJsonObject(raw: string): unknown {
  const stripped = stripFence(raw);
  const sliced = sliceObject(stripped);
  const tries = [
    sliced,
    repairTrailingCommas(sliced),
    closeOpen(repairTrailingCommas(sliced)),
    // Qwen often dumps huge broken htmlSnippet with raw quotes — drop field and retry.
    dropJsonField(sliced, "htmlSnippet"),
    repairTrailingCommas(dropJsonField(sliced, "htmlSnippet")),
    closeOpen(repairTrailingCommas(dropJsonField(sliced, "htmlSnippet"))),
  ];
  let last: unknown;
  for (const t of tries) {
    try {
      return JSON.parse(t);
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/**
 * Remove one object field even when its string value has unescaped quotes.
 * Stops at the next known sibling key or the closing `}`.
 */
export function dropJsonField(json: string, field: string): string {
  const startMark = `"${field}"`;
  const start = json.indexOf(startMark);
  if (start < 0) return json;
  const afterKey = json.slice(start + startMark.length);
  if (!/^\s*:/.test(afterKey)) return json;
  const valueRegion = json.slice(start);
  const nextKey = valueRegion.search(/,\s*"[a-zA-Z_][\w$]*"\s*:/);
  if (nextKey >= 0) {
    // Drop field up to the comma before next key — keep that comma+next key.
    return json.slice(0, start) + valueRegion.slice(nextKey + 1);
  }
  // Field is last — trim trailing comma on previous property.
  const end = json.lastIndexOf("}");
  if (end < start) return json;
  let head = json.slice(0, start).replace(/,\s*$/, "");
  return head + json.slice(end);
}

export function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function sliceObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("No JSON object in model response");
  }
  return text.slice(start, end + 1);
}

function repairTrailingCommas(json: string): string {
  return json.replace(/,\s*([}\]])/g, "$1");
}

/** Close unclosed { [ and dangling strings after token cutoff. */
function closeOpen(json: string): string {
  let t = json.trimEnd();
  if (endsInsideString(t)) t += '"';
  t = t.replace(/,\s*$/, "");
  const stack: Array<"{" | "["> = [];
  let inStr = false;
  let esc = false;
  for (const ch of t) {
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") stack.push("{");
    else if (ch === "[") stack.push("[");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  while (stack.length) {
    t += stack.pop() === "{" ? "}" : "]";
  }
  return repairTrailingCommas(t);
}

function endsInsideString(json: string): boolean {
  let inStr = false;
  let esc = false;
  for (const ch of json) {
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
  }
  return inStr;
}
