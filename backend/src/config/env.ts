import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const currentDir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(currentDir, '..', '..', '.env');

dotenv.config({ path: envPath });

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z
    .string()
    .transform((value) => value === 'true')
    .default(false),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z
    .string()
    .transform((value) => value !== 'false')
    .default(true),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  OTP_PEPPER: z.string().min(16).optional(),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().default(24),
  EMAIL_OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  RESET_PASSWORD_OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  APP_BASE_URL: z.string().url(),
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_PROVIDER: z.enum(['smtp', 'resend', 'brevo', 'postmark']).default('smtp'),
  RESEND_API_KEY: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z
    .string()
    .transform((value) => value === 'true')
    .optional(),
  SMTP_TLS_REJECT_UNAUTHORIZED: z
    .string()
    .transform((value) => value !== 'false')
    .default(true),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  REDIS_URL: z.string().url().optional(),
  REDIS_TLS: z
    .string()
    .transform((value) => value === 'true')
    .default(false),
  KRYNO_STUN_URLS: z.string().optional(),
  KRYNO_TURN_URLS: z.string().optional(),
  KRYNO_TURN_USERNAME: z.string().optional(),
  KRYNO_TURN_CREDENTIAL: z.string().optional(),
  LIVEKIT_URL: z.string().url().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
  R2_ENDPOINT: z.string().url().optional(),
  R2_REGION: z.string().default('auto'),
  MEDIA_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  REVENUECAT_WEBHOOK_SECRET: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
  WAF_PROVIDER: z.enum(['none', 'cloudflare', 'custom']).default('none'),
  SECURITY_ALERT_EMAIL: z.string().email().optional(),
  BACKUP_POLICY_URL: z.string().url().optional(),
  ALLOW_DEV_EMAIL_TOKEN_PREVIEW: z
    .string()
    .transform((value) => value === 'true')
    .default(false),
  ATTACHMENT_STORAGE_DIR: z.string().default('./storage/attachments'),
  MAX_ATTACHMENT_BYTES: z.coerce.number().int().positive().default(15728640),
  SOCIAL_MEDIA_STORAGE_DIR: z.string().default('./storage/social'),
  MAX_SOCIAL_MEDIA_BYTES: z.coerce.number().int().positive().default(20971520)
}).superRefine((env, ctx) => {
  if (env.APP_ENV !== 'production') {
    return;
  }

  const weakSecretFragments = ['dev', 'test', 'local', 'change', 'secret', 'password', 'kryno'];
  const assertProductionSecret = (key: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET' | 'OTP_PEPPER', value: string | undefined) => {
    const normalized = value?.toLowerCase() ?? '';
    if (!value || value.length < 48 || weakSecretFragments.some((fragment) => normalized.includes(fragment))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} must be a unique high-entropy production secret of at least 48 characters.`
      });
    }
  };

  assertProductionSecret('JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET);
  assertProductionSecret('JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET);
  assertProductionSecret('OTP_PEPPER', env.OTP_PEPPER);

  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_REFRESH_SECRET'],
      message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different in production.'
    });
  }

  if (env.OTP_PEPPER === env.JWT_REFRESH_SECRET || env.OTP_PEPPER === env.JWT_ACCESS_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OTP_PEPPER'],
      message: 'OTP_PEPPER must be separate from JWT secrets in production.'
    });
  }

  const appBaseUrl = new URL(env.APP_BASE_URL);
  if (
    appBaseUrl.hostname === 'localhost' ||
    appBaseUrl.hostname === '127.0.0.1' ||
    appBaseUrl.hostname.endsWith('.trycloudflare.com')
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['APP_BASE_URL'],
      message: 'APP_BASE_URL must be a permanent HTTPS production domain, not localhost or a temporary tunnel.'
    });
  }

  if (appBaseUrl.protocol !== 'https:') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['APP_BASE_URL'],
      message: 'APP_BASE_URL must use HTTPS in production.'
    });
  }

  if (env.ALLOW_DEV_EMAIL_TOKEN_PREVIEW) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ALLOW_DEV_EMAIL_TOKEN_PREVIEW'],
      message: 'Development OTP previews must be disabled in production.'
    });
  }

  if (!env.REDIS_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['REDIS_URL'],
      message: 'Production API abuse protection requires Redis-backed distributed rate limiting.'
    });
  }

  if (!env.SENTRY_DSN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SENTRY_DSN'],
      message: 'Production monitoring requires Sentry or a compatible error-monitoring DSN.'
    });
  }

  if (env.WAF_PROVIDER === 'none') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['WAF_PROVIDER'],
      message: 'Production must sit behind Cloudflare WAF or a documented custom WAF provider.'
    });
  }

  if (!env.SECURITY_ALERT_EMAIL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SECURITY_ALERT_EMAIL'],
      message: 'Production security alerts require a monitored alert email.'
    });
  }

  if (!env.BACKUP_POLICY_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['BACKUP_POLICY_URL'],
      message: 'Production requires a documented backup and recovery policy URL.'
    });
  }

  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['LIVEKIT_URL'],
      message: 'Production calls require LiveKit URL, API key, and API secret for the managed call layer.'
    });
  }

  const hasAnyTurnConfig = Boolean(env.KRYNO_TURN_URLS || env.KRYNO_TURN_USERNAME || env.KRYNO_TURN_CREDENTIAL);
  const hasCompleteTurnConfig = Boolean(env.KRYNO_TURN_URLS && env.KRYNO_TURN_USERNAME && env.KRYNO_TURN_CREDENTIAL);
  if (hasAnyTurnConfig && !hasCompleteTurnConfig) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['KRYNO_TURN_URLS'],
      message: 'Raw WebRTC fallback TURN config must include URLs, username, and credential when any TURN value is set.'
    });
  }

  const emailProviderReady =
    env.EMAIL_PROVIDER === 'smtp'
      ? Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS && env.EMAIL_FROM)
      : env.EMAIL_PROVIDER === 'resend'
        ? Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)
        : env.EMAIL_PROVIDER === 'brevo'
          ? Boolean(env.BREVO_API_KEY && env.EMAIL_FROM)
          : Boolean(env.POSTMARK_SERVER_TOKEN && env.EMAIL_FROM);

  if (!emailProviderReady) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['EMAIL_PROVIDER'],
      message: 'Production auth requires a configured transactional email provider.'
    });
  }

  if (env.MEDIA_STORAGE_DRIVER === 's3') {
    if (!env.R2_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || (!env.R2_ENDPOINT && !env.R2_ACCOUNT_ID)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MEDIA_STORAGE_DRIVER'],
        message: 'S3/R2 media storage requires bucket, access key, secret key, and endpoint or account id.'
      });
    }

    if (!env.R2_PUBLIC_BASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['R2_PUBLIC_BASE_URL'],
        message: 'Production social media storage requires a public CDN/base URL for profile, post, and story media.'
      });
    }
  }

  if (!env.REVENUECAT_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['REVENUECAT_WEBHOOK_SECRET'],
      message: 'Production subscription handling requires a RevenueCat webhook secret.'
    });
  }
});

export const env = envSchema.parse(process.env);
