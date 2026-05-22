import nodemailer from 'nodemailer';
import dns from 'node:dns';
import { resolve4 } from 'node:dns/promises';
import { env } from '../config/env.js';

dns.setDefaultResultOrder('ipv4first');

const EMAIL_SEND_TIMEOUT_MS = 12_000;

async function withEmailTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} timed out after ${EMAIL_SEND_TIMEOUT_MS}ms`));
        }, EMAIL_SEND_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export class EmailService {
  private transporterPromise: Promise<ReturnType<typeof nodemailer.createTransport>> | null = null;

  private async getTransporter() {
    if (!env.SMTP_HOST || !env.SMTP_PORT || !env.EMAIL_FROM) {
      return null;
    }

    if (!this.transporterPromise) {
      this.transporterPromise = resolve4(env.SMTP_HOST)
        .then((addresses) => addresses[0] ?? env.SMTP_HOST)
        .catch(() => env.SMTP_HOST)
        .then((smtpHost) =>
          nodemailer.createTransport({
            host: smtpHost,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE ?? false,
            connectionTimeout: 8_000,
            greetingTimeout: 8_000,
            socketTimeout: 12_000,
            auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
            tls: {
              servername: env.SMTP_HOST,
              rejectUnauthorized: env.SMTP_TLS_REJECT_UNAUTHORIZED
            }
          })
        );
    }

    return this.transporterPromise;
  }

  get hasRealTransport() {
    return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.EMAIL_FROM);
  }

  async sendVerificationEmail(email: string, code: string): Promise<boolean> {
    const transporter = await this.getTransporter();
    if (!transporter || !env.EMAIL_FROM) {
      console.log('[EMAIL_VERIFICATION_CODE]', JSON.stringify({ email, code }));
      return false;
    }

    try {
      await withEmailTimeout(
        transporter.sendMail({
          from: env.EMAIL_FROM,
          to: email,
          subject: 'Your KRYNO verification code',
          text: `Your KRYNO verification code is ${code}. It expires in ${env.EMAIL_OTP_TTL_MINUTES} minutes.`,
          html: `
            <div style="font-family:Arial,sans-serif;background:#0b0f1a;color:#f4f7ff;padding:24px">
              <div style="max-width:560px;margin:0 auto;background:rgba(255,255,255,.04);border:1px solid rgba(111,168,255,.25);border-radius:20px;padding:28px">
                <p style="margin:0 0 8px;color:#78dfff;font-size:12px;letter-spacing:.18em;text-transform:uppercase">KRYNO</p>
                <h1 style="margin:0 0 12px;font-size:28px;line-height:1.1">Verify your account</h1>
                <p style="margin:0 0 20px;color:#b6c0df;font-size:15px;line-height:1.6">
                  Enter this one-time verification code in the KRYNO app.
                </p>
                <div style="display:inline-block;padding:16px 22px;border-radius:16px;background:#10192b;border:1px solid rgba(111,168,255,.25);font-size:32px;font-weight:700;letter-spacing:.35em;color:#ffffff">
                  ${code}
                </div>
                <p style="margin:20px 0 0;color:#94a0bf;font-size:13px;line-height:1.6">
                  This code expires in ${env.EMAIL_OTP_TTL_MINUTES} minutes. If you did not request this, you can ignore this email.
                </p>
              </div>
            </div>
          `
        }),
        'Verification email'
      );

      return true;
    } catch (error) {
      console.error('[EMAIL_VERIFICATION_SEND_FAILED]', error);
      console.log('[EMAIL_VERIFICATION_CODE]', JSON.stringify({ email, code }));
      return false;
    }
  }

  async sendPasswordResetEmail(email: string, code: string): Promise<boolean> {
    const transporter = await this.getTransporter();
    if (!transporter || !env.EMAIL_FROM) {
      console.log('[PASSWORD_RESET_CODE]', JSON.stringify({ email, code }));
      return false;
    }

    try {
      await withEmailTimeout(
        transporter.sendMail({
          from: env.EMAIL_FROM,
          to: email,
          subject: 'Your KRYNO password reset code',
          text: `Your KRYNO password reset code is ${code}. It expires in ${env.RESET_PASSWORD_OTP_TTL_MINUTES} minutes.`,
          html: `
            <div style="font-family:Arial,sans-serif;background:#0b0f1a;color:#f4f7ff;padding:24px">
              <div style="max-width:560px;margin:0 auto;background:rgba(255,255,255,.04);border:1px solid rgba(111,168,255,.25);border-radius:20px;padding:28px">
                <p style="margin:0 0 8px;color:#78dfff;font-size:12px;letter-spacing:.18em;text-transform:uppercase">KRYNO</p>
                <h1 style="margin:0 0 12px;font-size:28px;line-height:1.1">Reset your password</h1>
                <p style="margin:0 0 20px;color:#b6c0df;font-size:15px;line-height:1.6">
                  Enter this reset code in the KRYNO app and choose a new password.
                </p>
                <div style="display:inline-block;padding:16px 22px;border-radius:16px;background:#10192b;border:1px solid rgba(111,168,255,.25);font-size:32px;font-weight:700;letter-spacing:.35em;color:#ffffff">
                  ${code}
                </div>
                <p style="margin:20px 0 0;color:#94a0bf;font-size:13px;line-height:1.6">
                  This code expires in ${env.RESET_PASSWORD_OTP_TTL_MINUTES} minutes. If you did not request this, you can ignore this email.
                </p>
              </div>
            </div>
          `
        }),
        'Password reset email'
      );

      return true;
    } catch (error) {
      console.error('[PASSWORD_RESET_SEND_FAILED]', error);
      console.log('[PASSWORD_RESET_CODE]', JSON.stringify({ email, code }));
      return false;
    }
  }

  async sendSecurityAlertEmail(
    email: string,
    input: {
      username: string;
      deviceName?: string | null;
      ip?: string | null;
      userAgent?: string | null;
      occurredAt: Date;
    }
  ): Promise<boolean> {
    const deviceName = input.deviceName?.trim() || 'a new device';
    const ip = input.ip || 'unknown IP';
    const userAgent = input.userAgent || 'unknown device/browser';
    const occurredAt = input.occurredAt.toISOString();

    const transporter = await this.getTransporter();
    if (!transporter || !env.EMAIL_FROM) {
      console.log('[SECURITY_ALERT_EMAIL]', JSON.stringify({ email, username: input.username, deviceName, ip, userAgent, occurredAt }));
      return false;
    }

    try {
      await withEmailTimeout(
        transporter.sendMail({
          from: env.EMAIL_FROM,
          to: email,
          subject: 'New KRYNO login detected',
          text: `Hi ${input.username}, we detected a login to your KRYNO account from ${deviceName} at ${occurredAt}. IP: ${ip}. Device: ${userAgent}. If this was not you, reset your password immediately.`,
          html: `
            <div style="font-family:Arial,sans-serif;background:#0b0f1a;color:#f4f7ff;padding:24px">
              <div style="max-width:560px;margin:0 auto;background:rgba(255,255,255,.04);border:1px solid rgba(111,168,255,.25);border-radius:20px;padding:28px">
                <p style="margin:0 0 8px;color:#78dfff;font-size:12px;letter-spacing:.18em;text-transform:uppercase">KRYNO SECURITY</p>
                <h1 style="margin:0 0 12px;font-size:28px;line-height:1.1">New login detected</h1>
                <p style="margin:0 0 18px;color:#b6c0df;font-size:15px;line-height:1.6">
                  Hi ${input.username}, a login was detected from <strong>${deviceName}</strong>.
                </p>
                <div style="padding:16px;border-radius:16px;background:#10192b;border:1px solid rgba(111,168,255,.2);color:#dce6ff;font-size:14px;line-height:1.7">
                  <div><strong>Time:</strong> ${occurredAt}</div>
                  <div><strong>IP:</strong> ${ip}</div>
                  <div><strong>Device:</strong> ${userAgent}</div>
                </div>
                <p style="margin:20px 0 0;color:#94a0bf;font-size:13px;line-height:1.6">
                  If this was not you, reset your password immediately and revoke unknown devices.
                </p>
              </div>
            </div>
          `
        }),
        'Security alert email'
      );

      return true;
    } catch (error) {
      console.error('[SECURITY_ALERT_SEND_FAILED]', error);
      return false;
    }
  }
}

export const emailService = new EmailService();
