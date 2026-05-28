import { env } from '../config/env.js';

type CheckResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

async function checkHttp(name: string, url: string, expectedStatus = 200): Promise<CheckResult> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Kryno-Staging-Check': 'true'
      }
    });

    return {
      name,
      ok: response.status === expectedStatus,
      detail: `${response.status} ${response.statusText}`
    };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : 'request failed'
    };
  }
}

async function checkSecurityHeaders(): Promise<CheckResult> {
  try {
    const response = await fetch(`${env.APP_BASE_URL.replace(/\/+$/, '')}/api/health`);
    const requiredHeaders = ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy'];
    const missing = requiredHeaders.filter((header) => !response.headers.get(header));

    return {
      name: 'security headers',
      ok: missing.length === 0,
      detail: missing.length ? `missing: ${missing.join(', ')}` : 'present'
    };
  } catch (error) {
    return {
      name: 'security headers',
      ok: false,
      detail: error instanceof Error ? error.message : 'request failed'
    };
  }
}

async function checkHostedEnvironment(): Promise<CheckResult> {
  try {
    const response = await fetch(`${env.APP_BASE_URL.replace(/\/+$/, '')}/api/health`, {
      headers: {
        Accept: 'application/json',
        'X-Kryno-Staging-Check': 'true'
      }
    });
    const payload = (await response.json()) as { environment?: string };

    return {
      name: 'hosted API production environment',
      ok: response.ok && payload.environment === 'production',
      detail: payload.environment ? `environment=${payload.environment}` : `${response.status} ${response.statusText}`
    };
  } catch (error) {
    return {
      name: 'hosted API production environment',
      ok: false,
      detail: error instanceof Error ? error.message : 'request failed'
    };
  }
}

function staticConfigChecks(): CheckResult[] {
  return [
    {
      name: 'permanent HTTPS API URL',
      ok: env.APP_BASE_URL.startsWith('https://') && !/localhost|127\.0\.0\.1|trycloudflare\.com/i.test(env.APP_BASE_URL),
      detail: env.APP_BASE_URL
    },
    {
      name: 'Redis distributed rate limiting configured',
      ok: Boolean(env.REDIS_URL),
      detail: env.REDIS_URL ? 'configured' : 'missing'
    },
    {
      name: 'WAF provider configured',
      ok: env.WAF_PROVIDER !== 'none',
      detail: env.WAF_PROVIDER
    },
    {
      name: 'Sentry configured',
      ok: Boolean(env.SENTRY_DSN),
      detail: env.SENTRY_DSN ? 'configured' : 'missing'
    },
    {
      name: 'backup policy configured',
      ok: Boolean(env.BACKUP_POLICY_URL),
      detail: env.BACKUP_POLICY_URL ?? 'missing'
    },
    {
      name: 'security alert mailbox configured',
      ok: Boolean(env.SECURITY_ALERT_EMAIL),
      detail: env.SECURITY_ALERT_EMAIL ?? 'missing'
    },
    {
      name: 'production object storage configured',
      ok: env.MEDIA_STORAGE_DRIVER === 's3' && Boolean(env.R2_PUBLIC_BASE_URL),
      detail: env.MEDIA_STORAGE_DRIVER
    }
  ];
}

async function main() {
  const baseUrl = env.APP_BASE_URL.replace(/\/+$/, '');
  const checks = [
    ...staticConfigChecks(),
    await checkHttp('health endpoint', `${baseUrl}/api/health`),
    await checkHttp('readiness endpoint', `${baseUrl}/api/ready`),
    await checkHostedEnvironment(),
    await checkSecurityHeaders()
  ];

  for (const check of checks) {
    const prefix = check.ok ? 'PASS' : 'FAIL';
    console.log(`${prefix} ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
  }

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

await main();
