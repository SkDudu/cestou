import {
  PRODUCT_CATEGORY_ENUM,
} from "../../../config/categories.js";

export const PROMPT_VERSION = "flyer-offers-v7";

const CATEGORY_SCHEMA = PRODUCT_CATEGORY_ENUM.split("|")
  .map((id) => `"${id}"`)
  .join("|");

export const SYSTEM_PROMPT = `Analyze supermarket flyer page images (JPEG/PNG).
Extract EVERY distinct product offer visible.
If the page shows the flyer validity period (e.g. "13/08 a 20/08"), extract it as validFrom and validUntil.
Return valid JSON only. Do not invent information.
If a field cannot be identified, return null — EXCEPT category, which is always required.
Never use "unknown", "N/A", or "não identificado" for product fields.
Prices must be numeric using decimal notation (27.99), never "R$ 27,99".
Do not count decorative elements. Do not count the same product twice.
A conditioned price (club, store card, CPF, app, coupon, payment, quantity) is NOT a universal price.
Only set a non-ALL eligibility when the printed evidence is next to THAT offer. Quote the exact text.
Do not invent conditions. Institutional "aceitamos cartões" is not a condition.
Installment ("10x", "à vista") is payment schedule, not eligibility.
Produce (fruta/verdura/legume) and fresh meat/fish/poultry → brand=null. Never invent brands like Frutas/Verduras/Carnes.
Every offer MUST have category: exactly one slug from the allowed enum. Never null. Never invent a slug outside the list. If unsure → mercearia.
Return minified JSON only. No markdown. Complete the JSON.`;

export function userPrompt(pageNumber: number): string {
  return `Analyze this supermarket flyer page.

Extract EVERY distinct product offer visible.

For each offer identify:

- name
- brand (manufacturer only; null for produce/meat/fish without a printed brand)
- category (REQUIRED — exactly one of: ${PRODUCT_CATEGORY_ENUM}; never null)
- quantity
- unit
- price (cash / à vista when both exist; never the installment amount)
- originalPrice (DE/POR list price only, never installment total)
- cashPrice (à vista if printed; null if only installments)
- installmentCount (N in "Nx"; null if none)
- installmentAmount (each installment; null if none)
- installmentInterestFree (true only if "sem juros" is printed)
- discount
- pageNumber
- eligibility (ALL_CUSTOMERS | LOYALTY_PROGRAM | STORE_CARD | CPF_REQUIRED | APP_ONLY | COUPON_REQUIRED | PAYMENT_METHOD | QUANTITY_REQUIRED | UNKNOWN)
- conditions (array of {type, name, description}; empty if ALL_CUSTOMERS)
- evidence ({text, page} required if eligibility is not ALL_CUSTOMERS)
- confidence (0-1 for this offer's eligibility)

Also extract the flyer validity period if printed on this page:
- validFrom (start date as written, e.g. "13/08/2026" or "13/08")
- validUntil (end date as written)

Rules:
1. Do not invent information.
2. If a field cannot be identified, return null — except category (always required).
3. Keep the product name as close as possible to the flyer.
4. Separate different products even when they appear in the same promotional block.
5. Do not count decorative elements as products.
6. Do not count the same product twice on the same page.
7. Prices must be numeric using decimal notation.
8. Return valid JSON only.
9. pageNumber = ${pageNumber}.
10. validFrom/validUntil are for the whole flyer, not per product. Null if not visible.
11. eligibility=ALL_CUSTOMERS when the printed price has no special condition next to the product.
12. If a seal/condition is visible but the type is unclear, eligibility=UNKNOWN and still quote evidence.text. Never guess a club/card.
13. Multiple conditions allowed (e.g. club + store card).
14. "R$ X à vista ou Nx de R$ Y" → cashPrice=X, price=X, installmentCount=N, installmentAmount=Y. One offer, not two.
15. Only "Nx de R$ Y" → cashPrice=null, installmentCount=N, installmentAmount=Y, price=N*Y (compare total). Do not put Y in price.
16. Installments are not eligibility. PAYMENT_METHOD only if the cash price itself requires PIX/card, with evidence.
17. "em até Nx" with no installment value → installmentCount=N, installmentAmount=null.
18. Do not invent interest or a total that is not printed.
19. Fruits, vegetables, legumes → brand=null, category=hortifruti.
20. Fresh meat, poultry, fish, seafood (no manufacturer printed) → brand=null, category=carnes.
21. category is REQUIRED on every offer. Pick exactly one enum slug. Never null. Never omit. If unsure → mercearia.
22. Never invent a category outside the enum. Never use acougue (use carnes).
23. Never use Frutas, Verduras, Legumes, Carnes, Hortifruti as brand.

Schema:
{"offers":[{"name":string,"brand":string|null,"category":${CATEGORY_SCHEMA},"quantity":string|null,"unit":string|null,"price":number,"originalPrice":number|null,"cashPrice":number|null,"installmentCount":number|null,"installmentAmount":number|null,"installmentInterestFree":boolean|null,"discount":number|null,"pageNumber":number,"eligibility":string,"conditions":[{"type":string,"name":string|null,"description":string|null}],"evidence":{"text":string,"page":number}|null,"confidence":number}],"validFrom":string|null,"validUntil":string|null,"confidence":number}`;
}
