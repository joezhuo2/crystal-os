/**
 * The Atmosphere's custom background image: checked, scaled down, and kept
 * in IndexedDB (localStorage is too small for images). One image at a time.
 */

export const IMAGE_TYPES = ["image/png", "image/jpeg"] as const;
/** Largest file accepted before scaling. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
/** Longest side kept. The image is shown blurred, so more pixels only cost memory. */
export const MAX_IMAGE_SIDE = 2560;

const DB_NAME = "crystal-os-atmosphere";
const STORE = "images";
const KEY = "background";

/** Why a file cannot be used, or null if it can. */
export function checkImage(file: { type: string; size: number }): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "Choose a PNG or JPEG image.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_IMAGE_BYTES) return "That image is over 25 MB.";
  return null;
}

/** Width and height scaled to fit within `max` on the longest side, never scaled up. */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Decodes the image (so a broken file fails here, not on screen) and scales
 * it down if it is larger than MAX_IMAGE_SIDE. Keeps the original type.
 */
export async function prepareImage(file: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That image could not be read.");
  }
  try {
    const size = fitWithin(bitmap.width, bitmap.height);
    if (size.width === bitmap.width && size.height === bitmap.height) return file;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const scaled = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.9));
    return scaled ?? file;
  } finally {
    bitmap.close();
  }
}

/** Longest side of the blurred copy. Blur hides detail, so this is plenty. */
export const BLUR_SIDE = 1600;
/** Default for the Image blur setting, 0–100. */
export const DEFAULT_IMAGE_BLUR = 50;

/** The Image blur setting (0–100) as a blur radius in pixels on a BLUR_SIDE-wide copy. */
export function blurRadius(amount: number): number {
  const a = Math.min(100, Math.max(0, amount));
  return Math.round((a / 100) * 40 * 10) / 10;
}

/**
 * A blurred copy of the background, baked once on a canvas so the page shows
 * a plain image instead of a live CSS blur. A full-screen CSS blur under the
 * aurora's blurred, moving layers could make the desktop WebView drop the
 * photo on high-DPI screens. The copy is drawn slightly oversized so the blur
 * never pulls transparent edges in. Returns the source when it cannot bake
 * (no canvas filter support) or when `amount` is 0.
 */
export async function blurImage(source: Blob, amount: number): Promise<Blob> {
  const radius = blurRadius(amount);
  if (radius === 0 || typeof createImageBitmap !== "function") return source;
  const bitmap = await createImageBitmap(source);
  try {
    const size = fitWithin(bitmap.width, bitmap.height, BLUR_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx || !("filter" in ctx)) return source;
    ctx.filter = `blur(${radius}px)`;
    const pad = radius * 2;
    ctx.drawImage(bitmap, -pad, -pad, size.width + pad * 2, size.height + pad * 2);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return out ?? source;
  } finally {
    bitmap.close();
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = act(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const hasDb = () => typeof indexedDB !== "undefined";

export async function loadImage(): Promise<Blob | null> {
  if (!hasDb()) return null;
  const value = await run<unknown>("readonly", (s) => s.get(KEY));
  return value instanceof Blob ? value : null;
}

export async function saveImage(blob: Blob): Promise<void> {
  if (!hasDb()) throw new Error("This browser cannot store images.");
  await run("readwrite", (s) => s.put(blob, KEY));
}

export async function deleteImage(): Promise<void> {
  if (!hasDb()) return;
  await run("readwrite", (s) => s.delete(KEY));
}
