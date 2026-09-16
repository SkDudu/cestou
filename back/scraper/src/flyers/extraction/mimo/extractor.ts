import sharp from "sharp";
import { flyerConfig } from "../../core/flyer-config.js";
import { flyerLog } from "../../core/flyer-logger.js";
import type {
  FlyerOfferExtractor,
  FlyerOfferExtractionResult,
} from "../../core/flyer-types.js";
import { mimoChat } from "./client.js";
import { MimoError } from "./errors.js";
import { SYSTEM_PROMPT, userPrompt } from "./prompts.js";
import { parseMimoOffers } from "./schemas.js";

function isPublicHttpsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host !== "localhost" &&
      host !== "127.0.0.1" &&
      host !== "::1" &&
      !host.endsWith(".local")
    );
  } catch {
    return false;
  }
}

/** Downscale long edge to `aiMaxImageEdgePx` on every platform (Docker Linux included). */
async function maybeResize(
  buffer: Buffer,
  contentType?: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const edge = flyerConfig.aiMaxImageEdgePx;
  const fallbackType = contentType?.startsWith("image/")
    ? contentType
    : "image/jpeg";
  try {
    const image = sharp(buffer, { failOn: "none" }).rotate();
    const meta = await image.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const withinEdge =
      width > 0 && height > 0 && width <= edge && height <= edge;

    if (withinEdge && meta.format === "jpeg") {
      return { buffer, contentType: "image/jpeg" };
    }
    if (withinEdge && meta.format === "png") {
      return { buffer, contentType: "image/png" };
    }

    const out = await image
      .resize({
        width: edge,
        height: edge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    if (width > edge || height > edge) {
      flyerLog.info(
        "AI_VISION",
        `resize ${width}x${height} → edge≤${edge} (${buffer.length}→${out.length} bytes)`,
      );
    }

    return { buffer: out, contentType: "image/jpeg" };
  } catch (err) {
    flyerLog.error(
      "AI_VISION",
      `resize failed — sending original: ${String(err)}`,
    );
    return { buffer, contentType: fallbackType };
  }
}

async function imageUrlForApi(page: {
  imageUrl?: string;
  imageBuffer?: Buffer;
  contentType?: string;
}): Promise<string> {
  if (page.imageUrl && isPublicHttpsUrl(page.imageUrl)) return page.imageUrl;
  if (!page.imageBuffer) {
    throw new MimoError("MiMo needs a public image URL or a local buffer");
  }
  const resized = await maybeResize(page.imageBuffer, page.contentType);
  return `data:${resized.contentType};base64,${resized.buffer.toString("base64")}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class MimoVisionExtractor implements FlyerOfferExtractor {
  readonly name = "mimo-v2.5" as const;

  async extractOffers(page: {
    flyerId: string;
    pageNumber: number;
    imageUrl?: string;
    imageBuffer?: Buffer;
    contentType?: string;
  }): Promise<FlyerOfferExtractionResult> {
    if (!flyerConfig.mimoApiKey) throw new MimoError("MIMO_API_KEY missing");

    const started = Date.now();
    let lastErr: unknown;
    const attempts = Math.max(1, flyerConfig.mimoMaxRetries);

    for (let i = 1; i <= attempts; i++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), flyerConfig.mimoTimeout);
        let json;
        try {
          json = await mimoChat({
            system: SYSTEM_PROMPT,
            user: userPrompt(page.pageNumber),
            signal: ctrl.signal,
            imageUrl: await imageUrlForApi(page),
          });
        } finally {
          clearTimeout(timer);
        }

        const rawResponse = json.choices?.[0]?.message?.content ?? "";
        const parsed = parseMimoOffers(rawResponse, page.pageNumber);
        const latencyMs = Date.now() - started;

        flyerLog.info(
          "AI_VISION",
          `page ${page.pageNumber} model=${flyerConfig.mimoModel} offers=${parsed.offers.length}/${parsed.rawCount} ${latencyMs}ms tokens=${json.usage?.total_tokens ?? "?"}`,
        );

        return {
          offers: parsed.offers,
          rawCount: parsed.rawCount,
          rawResponse,
          provider: this.name,
          model: flyerConfig.mimoModel,
          latencyMs,
          pageConfidence: parsed.confidence,
          validFrom: parsed.validFrom,
          validUntil: parsed.validUntil,
          usage: {
            promptTokens: json.usage?.prompt_tokens,
            completionTokens: json.usage?.completion_tokens,
            totalTokens: json.usage?.total_tokens,
          },
        };
      } catch (err) {
        lastErr = err;
        flyerLog.error(
          "AI_VISION",
          `Attempt ${i}/${attempts} page ${page.pageNumber}: ${String(err)}`,
        );
        const retryable =
          err instanceof MimoError ? err.retryable : true;
        if (!retryable || i >= attempts) break;
        await sleep(500 * 2 ** (i - 1));
      }
    }

    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}
