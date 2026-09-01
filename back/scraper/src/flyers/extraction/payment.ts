/** Unit cash / compare price cap. Parcel amount uses same bound. */
export const PRICE_MAX = 100_000;

export function nearMoney(a: number, b: number, eps = 0.03): boolean {
  return Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * eps);
}

export function moneyOk(n: number | undefined): n is number {
  return n !== undefined && Number.isFinite(n) && n > 0 && n < PRICE_MAX;
}

export function asInstallmentCount(value: unknown): number | undefined {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : NaN;
  if (!Number.isFinite(n)) return undefined;
  const i = Math.round(n);
  if (i < 2 || i > 48) return undefined;
  return i;
}

export function asInterestFree(value: unknown, haystack: string): boolean | undefined {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "string" && /sem\s+juros/i.test(value)) return true;
  if (/sem\s+juros/i.test(haystack)) return true;
  return undefined;
}

const NX_RE =
  /(\d{1,2})\s*[xX]\s*(?:de\s*)?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/;
const PRICE_RE = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g;

function parseBrl(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", "."));
}

export function parsePaymentFromText(text: string): {
  cashPrice?: number;
  installmentCount?: number;
  installmentAmount?: number;
  installmentInterestFree?: boolean;
} {
  const nx = text.match(NX_RE);
  const count = nx ? asInstallmentCount(nx[1]) : undefined;
  const amount = nx ? parseBrl(nx[2]!) : undefined;
  const installmentAmount = moneyOk(amount) ? amount : undefined;
  const installmentCount =
    count && installmentAmount ? count : undefined;

  const prices = [...text.matchAll(PRICE_RE)]
    .map((m) => parseBrl(m[1]!))
    .filter((p) => moneyOk(p));

  let cashPrice: number | undefined;
  if (/à\s*vista|a\s*vista/i.test(text) || (installmentAmount && prices.length > 1)) {
    const others = installmentAmount
      ? prices.filter((p) => !nearMoney(p, installmentAmount))
      : prices;
    cashPrice = others.find((p) =>
      installmentAmount ? p > installmentAmount : true,
    ) ?? others[0];
  }

  return {
    cashPrice: moneyOk(cashPrice) ? cashPrice : undefined,
    installmentCount,
    installmentAmount,
    installmentInterestFree: asInterestFree(undefined, text),
  };
}

export type PaymentShape = {
  price: number;
  cashPrice?: number;
  originalPrice?: number;
  installmentCount?: number;
  installmentAmount?: number;
  installmentInterestFree?: boolean;
};

export function shapePayment(args: {
  price?: number;
  cashPrice?: number;
  originalPrice?: number;
  installmentCount?: number;
  installmentAmount?: number;
  installmentInterestFree?: boolean;
  haystack: string;
}): PaymentShape | undefined {
  const n = args.installmentCount;
  const amt = moneyOk(args.installmentAmount) ? args.installmentAmount : undefined;
  const cash = moneyOk(args.cashPrice) ? args.cashPrice : undefined;
  let price = moneyOk(args.price) ? args.price : undefined;
  let originalPrice = moneyOk(args.originalPrice)
    ? args.originalPrice
    : undefined;

  if (cash) price = cash;
  else if (n && amt) price = Math.round(n * amt * 100) / 100;

  if (!moneyOk(price)) return undefined;

  const dePor = /\bDE\b[\s\S]{0,80}\bPOR\b/i.test(args.haystack);
  if (originalPrice && n && amt && !dePor && nearMoney(originalPrice, n * amt)) {
    originalPrice = undefined;
  }
  if (originalPrice && amt && !dePor && nearMoney(originalPrice, amt)) {
    originalPrice = undefined;
  }
  if (originalPrice !== undefined && originalPrice < price) {
    originalPrice = undefined;
  }

  return {
    price,
    cashPrice: cash,
    originalPrice,
    installmentCount: n && amt ? n : undefined,
    installmentAmount: n && amt ? amt : undefined,
    installmentInterestFree: asInterestFree(
      args.installmentInterestFree,
      args.haystack,
    ),
  };
}
