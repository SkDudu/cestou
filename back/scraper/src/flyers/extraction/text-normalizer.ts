export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeProductName(name: string): string {
  return normalizeWhitespace(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}
