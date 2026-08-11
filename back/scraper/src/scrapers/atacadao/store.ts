import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

const BASE = "https://www.atacadao.com.br";
/** Fortaleza — Aldeota / Meireles */
const FORTALEZA_CEP = "60160000";

let regionId: string | null | undefined;
let segmentCookie: string | null = null;

function buildSegmentCookie(rid: string): string {
  const segment = {
    campaigns: null,
    channel: "1",
    priceTables: null,
    regionId: rid,
    utm_campaign: null,
    utm_source: null,
    utmi_campaign: null,
    currencyCode: "BRL",
    currencySymbol: "R$",
    countryCode: "BRA",
    channelPrivacy: "public",
  };
  return Buffer.from(JSON.stringify(segment)).toString("base64");
}

/** Resolve VTEX regionId for Fortaleza CEP (once). */
export async function ensureFortalezaRegion(): Promise<string | null> {
  if (regionId !== undefined) return regionId;

  const url = `${BASE}/api/checkout/pub/regions?country=BRA&postalCode=${FORTALEZA_CEP}`;
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(config.timeout),
    });
    if (!res.ok) {
      logger.debug(`Atacadão regions ${res.status} — national prices`);
      regionId = null;
      return null;
    }
    const data = (await res.json()) as Array<{
      id?: string;
      sellers?: Array<{ id: string; name: string }>;
    }>;
    const id = data[0]?.id ?? null;
    regionId = id;
    if (id) {
      segmentCookie = buildSegmentCookie(id);
      const sellers = data[0]?.sellers?.map((s) => s.name).join(", ") ?? "";
      logger.debug(`Atacadão Fortaleza region ${id} (${sellers})`);
    }
    return id;
  } catch (err) {
    logger.debug(`Atacadão regions failed: ${String(err)}`);
    regionId = null;
    return null;
  }
}

export function atacadaoHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    accept: "application/json",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };
  if (segmentCookie) h.cookie = `vtex_segment=${segmentCookie}`;
  return h;
}
