import crypto from 'node:crypto';
import sharp from 'sharp';
import exifr from 'exifr';

// Server-only. Image-level fraud signals: exact SHA-256 and EXIF sanity.
// (A perceptual hash was measured and rejected: it cannot tell re-photos of one receipt from
// different receipts on the same template — see the note in migrations/001_hardening.sql.)
// Thresholds are untuned until real receipt photos are available.

/** A photo whose EXIF capture time is older than this was not taken for this upload. */
export const MAX_PHOTO_AGE_HOURS = 48;
/** Allowed clock skew for photos "from the future". */
export const MAX_PHOTO_FUTURE_MINUTES = 15;
const EDITOR_SOFTWARE = /photoshop|gimp|canva|snapseed|lightroom|pixelmator|picsart|photopea|affinity|paint\.net/i;

export interface ImageAnalysis {
  sha256: string;
  exifPresent: boolean;
  exifCapturedAt: Date | null;
  software: string | null;
  width: number;
  height: number;
}

export type ImageVerdict =
  | { ok: true }
  | { ok: false; code: 'IMAGE_EDITED' | 'IMAGE_NOT_RECENT' | 'IMAGE_TOO_SMALL'; message: string };

export async function analyseImage(buf: Buffer): Promise<ImageAnalysis> {
  const meta = await sharp(buf).metadata(); // throws if the bytes are not a decodable image
  // exifr's defaults already read IFD0 (Make/Model/Software) and the EXIF block (DateTimeOriginal).
  const exif = await exifr.parse(buf).catch(() => null);

  const captured: unknown = exif?.DateTimeOriginal ?? exif?.CreateDate ?? null;
  return {
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    // exifr also reports PNG header fields (ImageWidth, BitDepth…), so count only real EXIF tags.
    exifPresent: !!exif && ['Make', 'Model', 'Software', 'DateTimeOriginal', 'CreateDate', 'ExifVersion'].some((k) => exif[k] != null),
    exifCapturedAt: captured instanceof Date && !isNaN(captured.getTime()) ? captured : null,
    software: typeof exif?.Software === 'string' ? exif.Software : null,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}

/**
 * Missing EXIF is allowed (screenshots and some browsers strip it) but recorded;
 * present-but-bad EXIF is rejected.
 */
export function judgeImage(a: ImageAnalysis, now: Date = new Date()): ImageVerdict {
  if (a.width < 400 || a.height < 400) {
    return { ok: false, code: 'IMAGE_TOO_SMALL', message: 'The photo is too small to read. Move closer and retake it.' };
  }
  if (a.software && EDITOR_SOFTWARE.test(a.software)) {
    return { ok: false, code: 'IMAGE_EDITED', message: 'This photo appears to have been edited. Please upload an unedited photo of the receipt.' };
  }
  if (a.exifCapturedAt) {
    const ageMs = now.getTime() - a.exifCapturedAt.getTime();
    if (ageMs > MAX_PHOTO_AGE_HOURS * 3_600_000 || ageMs < -MAX_PHOTO_FUTURE_MINUTES * 60_000) {
      return { ok: false, code: 'IMAGE_NOT_RECENT', message: 'This photo was not taken recently. Please take a fresh photo of the receipt.' };
    }
  }
  return { ok: true };
}
