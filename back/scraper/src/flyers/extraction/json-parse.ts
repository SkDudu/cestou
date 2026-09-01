/** Extract a JSON object from model output (fences, trailing commas, truncation). */
export function parseJsonObject(raw: string): unknown {
  const stripped = stripFence(raw);
  const sliced = sliceObject(stripped);
  const tries = [
    sliced,
    repairTrailingCommas(sliced),
    closeOpen(repairTrailingCommas(sliced)),
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
