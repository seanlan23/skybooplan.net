export const HERO_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export type HeroChatAttachmentKind = "image" | "pdf";

export type HeroChatAttachmentPayload = {
  filename: string;
  mimeType: string;
  kind: HeroChatAttachmentKind;
  base64: string;
};

export type HeroChatSelectedFile = {
  file: File;
  previewUrl: string | null;
  kind: HeroChatAttachmentKind;
};

const IMAGE_MIME_PREFIX = "image/";

export function classifyHeroAttachmentFile(file: File): HeroChatAttachmentKind | null {
  const mime = file.type.trim().toLowerCase();
  const name = file.name.trim().toLowerCase();

  if (mime.startsWith(IMAGE_MIME_PREFIX)) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return null;
}

export function validateHeroAttachmentFile(file: File): string | null {
  if (file.size > HERO_ATTACHMENT_MAX_BYTES) {
    return "heroChat.fileTooLarge";
  }
  if (!classifyHeroAttachmentFile(file)) {
    return "heroChat.fileTypeInvalid";
  }
  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read file"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function stripDataUrlPrefix(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL");
  }
  return { mimeType: match[1]!, base64: match[2]! };
}

export async function fileToHeroAttachmentPayload(file: File): Promise<HeroChatAttachmentPayload> {
  const validationError = validateHeroAttachmentFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const kind = classifyHeroAttachmentFile(file);
  if (!kind) {
    throw new Error("heroChat.fileTypeInvalid");
  }

  const dataUrl = await readFileAsDataUrl(file);
  const { mimeType, base64 } = stripDataUrlPrefix(dataUrl);

  return {
    filename: file.name,
    mimeType: kind === "pdf" ? "application/pdf" : mimeType,
    kind,
    base64,
  };
}

export function createHeroAttachmentPreviewUrl(file: File, kind: HeroChatAttachmentKind): string | null {
  if (kind !== "image") return null;
  return URL.createObjectURL(file);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function parseHeroChatAttachment(raw: unknown): HeroChatAttachmentPayload | null {
  const record = asRecord(raw);
  if (!record) return null;

  const filename = readString(record, "filename");
  const mimeType = readString(record, "mimeType");
  const base64 = readString(record, "base64");
  const kindRaw = readString(record, "kind");

  if (!filename || !mimeType || !base64) return null;
  if (kindRaw !== "image" && kindRaw !== "pdf") return null;
  if (estimateBase64Bytes(base64) > HERO_ATTACHMENT_MAX_BYTES) return null;

  const kind = kindRaw as HeroChatAttachmentKind;
  if (kind === "pdf" && mimeType !== "application/pdf") return null;
  if (kind === "image" && !mimeType.startsWith("image/")) return null;

  return { filename, mimeType, kind, base64 };
}
