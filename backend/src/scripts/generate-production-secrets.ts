import { randomBytes } from 'node:crypto';

function secret(bytes = 48) {
  return randomBytes(bytes).toString('base64url');
}

console.log(`JWT_ACCESS_SECRET=${secret(64)}`);
console.log(`JWT_REFRESH_SECRET=${secret(64)}`);
console.log(`OTP_PEPPER=${secret(64)}`);
console.log(`REVENUECAT_WEBHOOK_SECRET=${secret(48)}`);
