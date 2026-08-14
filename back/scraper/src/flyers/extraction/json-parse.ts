/** Extract a JSON object from model output (fences, trailing commas). */
export function parseJsonObject(raw: string): unknown {
  const stripped = stripFence(raw);
  const sliced = sliceObject(stripped);
  try {
    return JSON.parse(sliced);
  } catch {
    return JSON.parse(repairTrailingCommas(sliced));
  }
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
