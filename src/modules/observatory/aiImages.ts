import type { AiContentPart } from "@/lib/ai";

export interface AiImage { name: string; mediaType: "image/png" | "image/jpeg"; data: string }

const MAX_SIDE = 1568;
const MAX_BYTES = 1_500_000;

export const isAiImage = (f: File) => f.type === "image/png" || f.type === "image/jpeg";
export const imagePart = (i: AiImage): AiContentPart => ({ type: "image", mediaType: i.mediaType, data: i.data });
export const imageUrl = (i: AiImage) => `data:${i.mediaType};base64,${i.data}`;

const dataOf = (url: string) => url.slice(url.indexOf(",") + 1);

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the image"));
    reader.readAsDataURL(file);
  });
}

export function canvasImage(source: CanvasImageSource & { width: number; height: number }, name: string): AiImage {
  const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not shrink the image");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { name, mediaType: "image/jpeg", data: dataOf(canvas.toDataURL("image/jpeg", 0.85)) };
}

export async function imageFromFile(file: File): Promise<AiImage> {
  if (!isAiImage(file)) throw new Error(`${file.name || "That file"} is not a PNG or JPEG image`);
  const name = file.name || "pasted image";
  const bitmap = await createImageBitmap(file);
  try {
    if (file.size <= MAX_BYTES && Math.max(bitmap.width, bitmap.height) <= MAX_SIDE)
      return { name, mediaType: file.type as AiImage["mediaType"], data: dataOf(await readDataUrl(file)) };
    return canvasImage(bitmap, name);
  } finally {
    bitmap.close();
  }
}
