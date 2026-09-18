import { z } from "zod";
import sharp from "sharp";
import {
  anthropicModelClient,
  structuredCall,
  type ImageInput,
} from "./client";
import type { StructuredCallArgs, StructuredCallResult } from "./openrouter";

/** Direct Claude Haiku with a dedicated server-only Shipyard credential. */
export async function callStudio<T>(
  args: StructuredCallArgs<T>,
): Promise<StructuredCallResult<T>> {
  const key = process.env.SHIPYARD_ANTHROPIC_API_KEY;
  if (!key)
    throw new Error(
      "The AI reviewer is temporarily unavailable. Your work is saved.",
    );
  const content =
    typeof args.user === "string"
      ? [{ type: "text" as const, text: args.user }]
      : args.user;
  const images: ImageInput[] = [];
  const text: string[] = [];
  for (const part of content) {
    if (part.type === "text") {
      text.push(part.text);
      continue;
    }
    const match =
      /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
        part.image_url.url,
      );
    if (!match)
      throw new Error("Only verified inline images can enter the reviewer.");
    const bytes = await sharp(Buffer.from(match[2], "base64"), {
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({
        width: 1568,
        height: 1568,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    if (bytes.length > 4_000_000)
      throw new Error("The image could not be prepared for review.");
    images.push({
      mediaType: "image/jpeg",
      dataBase64: bytes.toString("base64"),
    });
    text.push(
      `[Image ${images.length} appears in the attached images, in this order.]`,
    );
  }
  const model = "claude-haiku-4-5-20251001";
  const result = await structuredCall(
    {
      system: `${args.system}\nReturn JSON matching this schema: ${JSON.stringify(z.toJSONSchema(args.schema))}`,
      user: text.join("\n\n"),
      images,
      schema: args.schema,
      model,
      temperature: args.temperature,
      maxTokens: args.maxTokens || 8192,
    },
    anthropicModelClient(key),
  );
  return {
    data: result.data,
    raw: result.raw,
    modelUsed: model,
    providerUsed: "anthropic-direct",
    tokensIn: result.usage.inputTokens,
    tokensOut: result.usage.outputTokens,
    costUsd:
      (result.usage.inputTokens + result.usage.outputTokens * 5) / 1_000_000,
  };
}
