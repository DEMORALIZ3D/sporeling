import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';

export const CAPTURE_DIR = path.join(os.homedir(), '.sporeling', 'captures');
fs.mkdirSync(CAPTURE_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// In-app capture sessions: the viewfinder requests a single-use nonce when it
// opens. Uploads without a live nonce (e.g. gallery images) are refused.
// ---------------------------------------------------------------------------
const NONCE_TTL_MS = 15 * 60 * 1000;
const nonces = new Map<string, number>();

export function issueCaptureNonce(): { nonce: string; expiresAt: number } {
  const now = Date.now();
  for (const [k, exp] of nonces) if (exp < now) nonces.delete(k);
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = now + NONCE_TTL_MS;
  nonces.set(nonce, expiresAt);
  return { nonce, expiresAt };
}

/** Nonces are reusable within a viewfinder session but must be live. */
export function validateCaptureNonce(nonce: string | undefined): boolean {
  if (!nonce) return false;
  const exp = nonces.get(nonce);
  return !!exp && exp > Date.now();
}

// ---------------------------------------------------------------------------
// Image processing
// ---------------------------------------------------------------------------
export interface ProcessedImage {
  llmJpeg: Buffer; // small JPEG for Gemma (≤ 768px)
  width: number;
  height: number;
  dhash: string; // 64-bit difference hash (hex)
  exif: Record<string, unknown> | null;
}

/** 64-bit dHash: grayscale 9x8, compare horizontal neighbours. */
async function differenceHash(buf: Buffer): Promise<string> {
  const px = await sharp(buf)
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, '0');
}

export function hammingDistance(a: string, b: string): number {
  let v = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (v) {
    n += Number(v & 1n);
    v >>= 1n;
  }
  return n;
}

export async function processCapture(raw: Buffer): Promise<ProcessedImage> {
  let exif: Record<string, unknown> | null = null;
  try {
    const parsed = await exifr.parse(raw, {
      gps: true,
      tiff: true,
      exif: true,
    });
    if (parsed) {
      exif = {};
      for (const k of [
        'Make',
        'Model',
        'DateTimeOriginal',
        'latitude',
        'longitude',
        'GPSAltitude',
        'ExposureTime',
        'FNumber',
        'ISO',
        'FocalLength',
        'LensModel',
      ]) {
        if (parsed[k] !== undefined) exif[k] = parsed[k];
      }
    }
  } catch {
    /* in-app canvas captures carry no EXIF; metadata comes from the client */
  }

  const llmJpeg = await sharp(raw)
    .rotate()
    .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(llmJpeg).metadata();
  const dhash = await differenceHash(raw);

  return {
    llmJpeg,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    dhash,
    exif,
  };
}

/** Persist the LLM-sized image + a 256px thumbnail. */
export async function saveCaptureFiles(
  id: string,
  llmJpeg: Buffer,
): Promise<{ imagePath: string; thumbPath: string }> {
  const imagePath = path.join(CAPTURE_DIR, `${id}.jpg`);
  const thumbPath = path.join(CAPTURE_DIR, `${id}_thumb.jpg`);
  await fs.promises.writeFile(imagePath, llmJpeg);
  await sharp(llmJpeg)
    .resize(256, 256, { fit: 'cover' })
    .jpeg({ quality: 75 })
    .toFile(thumbPath);
  return { imagePath, thumbPath };
}
