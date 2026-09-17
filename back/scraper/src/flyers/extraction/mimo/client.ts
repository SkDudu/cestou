import { flyerConfig } from "../../core/flyer-config.js";
import { MimoError } from "./errors.js";
import type { ChatCompletionResponse } from "./types.js";

export type MimoChatArgs = {
  system: string;
  user: string;
  signal: AbortSignal;
  imageUrl?: string;
};

function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "host.docker.internal"
    );
  } catch {
    return false;
  }
}

function resolveResponseFormat():
  | { type: "json_object" }
  | { type: "text" }
  | undefined {
  const mode = flyerConfig.mimoResponseFormat;
  if (mode === "none" || mode === "off") return undefined;
  if (mode === "text") return { type: "text" };
  if (mode === "json_object") return { type: "json_object" };
  // auto: LM Studio rejects json_object — omit and rely on prompt JSON
  if (isLocalBaseUrl(flyerConfig.mimoBaseUrl)) return undefined;
  return { type: "json_object" };
}

export async function mimoChat(args: MimoChatArgs): Promise<ChatCompletionResponse> {
  const content: unknown[] = [{ type: "text", text: args.user }];
  if (args.imageUrl) {
    content.push({
      type: "image_url",
      image_url: { url: args.imageUrl },
    });
  }

  const responseFormat = resolveResponseFormat();
  const body: Record<string, unknown> = {
    model: flyerConfig.mimoModel,
    temperature: 0.1,
    max_completion_tokens: flyerConfig.mimoMaxCompletionTokens,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content },
    ],
  };
  if (responseFormat) body.response_format = responseFormat;

  const res = await fetch(`${flyerConfig.mimoBaseUrl}/chat/completions`, {
    method: "POST",
    signal: args.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${flyerConfig.mimoApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new MimoError(
      `MiMo HTTP ${res.status}${errBody ? `: ${errBody.slice(0, 200)}` : ""}`,
      res.status,
    );
  }

  return (await res.json()) as ChatCompletionResponse;
}
