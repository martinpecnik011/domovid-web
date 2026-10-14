// Browser-side photo preparation for the lead form: downscale to JPEG, or pass the original through
// when the browser cannot decode it (e.g. HEIC outside Safari). Limits mirror apps-script/Code.gs.

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export interface ResizedImage {
  name: string;
  type: string;
  /** Base64 without the data: prefix. */
  data: string;
  width: number;
  height: number;
  /** Decoded byte size of the image. */
  bytes: number;
}

export interface ResizeOptions {
  maxSide?: number;
  quality?: number;
}

/** MIME type of a file, inferred from the extension when the browser leaves it empty (common for HEIC). */
export function fileType(file: File): string {
  if (file.type) return file.type.toLowerCase();
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const byExt: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return byExt[ext] || '';
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

type Source = { image: CanvasImageSource; width: number; height: number; release: () => void };

async function decode(file: File): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

const jpegName = (name: string) => (name.replace(/\.[^./\\]+$/, '') || 'foto') + '.jpg';

/**
 * Downscale `file` so its longer side is at most `maxSide` and re-encode it as JPEG.
 * Returns the original bytes when decoding fails but the file is an allowed type ≤ 8 MB,
 * or null when it has to be skipped.
 */
export async function resizeImage(
  file: File,
  { maxSide = 1600, quality = 0.82 }: ResizeOptions = {},
): Promise<ResizedImage | null> {
  let src: Source | null = null;
  try {
    src = await decode(file);
  } catch {
    src = null;
  }

  if (src && src.width > 0 && src.height > 0) {
    const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
    const width = Math.max(1, Math.round(src.width * scale));
    const height = Math.max(1, Math.round(src.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.fillStyle = '#fff'; // transparent PNG areas would turn black in JPEG
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src.image, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob) {
        return { name: jpegName(file.name), type: 'image/jpeg', data: await toBase64(blob), width, height, bytes: blob.size };
      }
    } catch {
      // fall back to the original below
    } finally {
      src.release();
      canvas.width = canvas.height = 0; // free the backing store early on phones
    }
  }

  const type = fileType(file);
  if (file.size <= MAX_FILE_BYTES && ALLOWED_TYPES.includes(type)) {
    return { name: file.name, type, data: await toBase64(file), width: 0, height: 0, bytes: file.size };
  }
  return null;
}
