import { createHash, createHmac, randomBytes } from 'node:crypto';

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function generateOtpCode(length = 6): string {
  const max = 10 ** length;
  const value = randomBytes(4).readUInt32BE(0) % max;
  return value.toString().padStart(length, '0');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}
