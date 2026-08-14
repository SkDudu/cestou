export const PROMPT_VERSION = "flyer-offers-v1";

export const SYSTEM_PROMPT = `Analyze supermarket flyer page images (JPEG/PNG).
Extract EVERY distinct product offer visible.
Return valid JSON only. Do not invent information.
If a field cannot be identified, return null.
Never use "unknown", "N/A", or "não identificado".
Prices must be numeric using decimal notation (27.99), never "R$ 27,99".
Do not count decorative elements. Do not count the same product twice.`;

export function userPrompt(pageNumber: number): string {
  return `Analyze this supermarket flyer page.

Extract EVERY distinct product offer visible.

For each offer identify:

- name
- brand
- quantity
- unit
- price
- originalPrice
- discount
- pageNumber

Rules:
1. Do not invent information.
2. If a field cannot be identified, return null.
3. Keep the product name as close as possible to the flyer.
4. Separate different products even when they appear in the same promotional block.
5. Do not count decorative elements as products.
6. Do not count the same product twice on the same page.
7. Prices must be numeric using decimal notation.
8. Return valid JSON only.
9. pageNumber = ${pageNumber}.

Schema:
{"offers":[{"name":string,"brand":string|null,"quantity":string|null,"unit":string|null,"price":number,"originalPrice":number|null,"discount":number|null,"pageNumber":number}],"confidence":number}`;
}
