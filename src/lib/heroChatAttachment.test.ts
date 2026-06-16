import { describe, expect, it } from "vitest";
import {
  HERO_ATTACHMENT_MAX_BYTES,
  classifyHeroAttachmentFile,
  stripDataUrlPrefix,
  validateHeroAttachmentFile,
} from "@/lib/heroChatAttachment";

describe("validateHeroAttachmentFile", () => {
  it("accepts images and pdfs under 5MB", () => {
    const image = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(image, "size", { value: 1024 });
    expect(validateHeroAttachmentFile(image)).toBeNull();
    expect(classifyHeroAttachmentFile(image)).toBe("image");

    const pdf = new File(["x"], "plan.pdf", { type: "application/pdf" });
    Object.defineProperty(pdf, "size", { value: 2048 });
    expect(validateHeroAttachmentFile(pdf)).toBeNull();
    expect(classifyHeroAttachmentFile(pdf)).toBe("pdf");
  });

  it("rejects files over 5MB", () => {
    const big = new File(["x"], "big.jpg", { type: "image/jpeg" });
    Object.defineProperty(big, "size", { value: HERO_ATTACHMENT_MAX_BYTES + 1 });
    expect(validateHeroAttachmentFile(big)).toBe("heroChat.fileTooLarge");
  });

  it("rejects unsupported types", () => {
    const doc = new File(["x"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(doc, "size", { value: 100 });
    expect(validateHeroAttachmentFile(doc)).toBe("heroChat.fileTypeInvalid");
  });
});

describe("stripDataUrlPrefix", () => {
  it("parses base64 data URLs", () => {
    expect(stripDataUrlPrefix("data:image/png;base64,abc123")).toEqual({
      mimeType: "image/png",
      base64: "abc123",
    });
  });
});
