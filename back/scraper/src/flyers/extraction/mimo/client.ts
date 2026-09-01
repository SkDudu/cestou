import { flyerConfig } from "../../core/flyer-config.js";
import { MimoError } from "./errors.js";
import type { ChatCompletionResponse } from "./types.js";

export type MimoChatArgs = {
  system: string;
  user: string;
  signal: AbortSignal;
  imageUrl?: string;
};

export async function mimoChat(args: MimoChatArgs): Promise<ChatCompletionResponse> {
  const content: unknown[] = [{ type: "text", text: args.user }];
  if (args.imageUrl) {
    content.push({
      type: "image_url",
      image_url: { url: args.imageUrl },
    });
  }

  const res = await fetch(`${flyerConfig.mimoBaseUrl}/chat/completions`, {
    method: "POST",
    signal: args.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${flyerConfig.mimoApiKey}`,
    },
    body: JSON.stringify({
      model: flyerConfig.mimoModel,
      temperature: 0.1,
      max_completion_tokens: flyerConfig.mimoMaxCompletionTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: args.system },
        { role: "user", content },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new MimoError(
      `MiMo HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      res.status,
    );
  }

  return (await res.json()) as ChatCompletionResponse;
}
