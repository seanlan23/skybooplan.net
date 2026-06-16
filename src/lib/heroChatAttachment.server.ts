import { geminiApiKey } from "@/lib/llm";
import type { HeroChatAttachmentPayload } from "@/lib/heroChatAttachment";

export const HERO_IMAGE_VISION_HINT =
  "User has also shared an image. Analyze it and incorporate it into travel recommendations.";

async function extractPdfTextWithGemini(
  base64: string,
  filename: string,
): Promise<string | null> {
  const key = geminiApiKey();
  if (!key) return null;

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "application/pdf", data: base64 } },
            {
              text: `Extract all travel-relevant text from this PDF (${filename}). Include destinations, dates, budgets, preferences, and itinerary details. Return plain text only, no markdown.`,
            },
          ],
        },
      ],
    });
    const text = response.text?.trim();
    return text || null;
  } catch (err) {
    console.warn("[heroChatAttachment] PDF extract failed:", err);
    return null;
  }
}

export type HeroAttachmentContext = {
  searchQuerySuffix: string;
  plannerWishesAppend: string;
  geminiImage?: { mimeType: string; base64: string };
};

/** Build text/image context for hero search + AI planner from an uploaded file. */
export async function buildHeroAttachmentContext(
  attachment: HeroChatAttachmentPayload,
): Promise<HeroAttachmentContext> {
  if (attachment.kind === "image") {
    return {
      searchQuerySuffix: "",
      plannerWishesAppend: HERO_IMAGE_VISION_HINT,
      geminiImage: {
        mimeType: attachment.mimeType,
        base64: attachment.base64,
      },
    };
  }

  const extracted = await extractPdfTextWithGemini(attachment.base64, attachment.filename);
  const pdfBlock = extracted
    ? `User shared a PDF (${attachment.filename}). Extracted content:\n${extracted.slice(0, 4000)}`
    : `User shared a PDF (${attachment.filename}) with travel details — incorporate any relevant constraints.`;

  return {
    searchQuerySuffix: `\n\n${pdfBlock}`,
    plannerWishesAppend: pdfBlock,
    geminiImage: undefined,
  };
}
