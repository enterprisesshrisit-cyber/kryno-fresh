import { AppError } from './errors.js';

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'video/x-m4v': 'video/mp4',
  'video/mov': 'video/quicktime'
};

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov'
};

function startsWithBytes(bytes: Buffer, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function looksLikeJpeg(bytes: Buffer) {
  return bytes.length >= 3 && startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
}

function looksLikePng(bytes: Buffer) {
  return bytes.length >= 8 && startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function looksLikeGif(bytes: Buffer) {
  if (bytes.length < 6) return false;
  const header = bytes.subarray(0, 6).toString('ascii');
  return header === 'GIF87a' || header === 'GIF89a';
}

function looksLikeWebp(bytes: Buffer) {
  if (bytes.length < 12) return false;
  return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

function looksLikeMp4Family(bytes: Buffer) {
  if (bytes.length < 12) return false;
  return bytes.subarray(4, 8).toString('ascii') === 'ftyp';
}

function looksLikeQuicktime(bytes: Buffer) {
  if (!looksLikeMp4Family(bytes)) return false;
  const brand = bytes.subarray(8, 12).toString('ascii');
  return brand === 'qt  ' || brand === 'moov' || brand === 'M4V ';
}

function looksLikeWebm(bytes: Buffer) {
  return bytes.length >= 4 && startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
}

export function normalizeMediaMimeType(mimeType: string | null | undefined) {
  const normalized = mimeType?.trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  return MIME_ALIASES[normalized] ?? normalized;
}

export function inferTrustedMediaMimeType(bytes: Buffer) {
  if (looksLikeJpeg(bytes)) return 'image/jpeg';
  if (looksLikePng(bytes)) return 'image/png';
  if (looksLikeGif(bytes)) return 'image/gif';
  if (looksLikeWebp(bytes)) return 'image/webp';
  if (looksLikeQuicktime(bytes)) return 'video/quicktime';
  if (looksLikeMp4Family(bytes)) return 'video/mp4';
  if (looksLikeWebm(bytes)) return 'video/webm';
  return null;
}

export function assertTrustedMediaPayload(mimeType: string, bytes: Buffer) {
  if (bytes.byteLength === 0) {
    throw new AppError(400, 'Media payload is empty.', 'EMPTY_MEDIA_PAYLOAD');
  }

  const normalizedMimeType = normalizeMediaMimeType(mimeType);
  const sniffedMimeType = inferTrustedMediaMimeType(bytes);

  if (!sniffedMimeType) {
    throw new AppError(400, 'Unsupported or unreadable media file.', 'INVALID_MEDIA_TYPE');
  }

  return sniffedMimeType;
}

export function getCanonicalMediaExtension(mimeType: string) {
  const extension = MIME_TO_EXTENSION[normalizeMediaMimeType(mimeType)];
  if (!extension) {
    throw new AppError(400, 'Unsupported media type.', 'INVALID_MEDIA_TYPE');
  }

  return extension;
}
