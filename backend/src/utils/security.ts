type SlidingWindowState = {
  hits: number[];
};

export type SlidingWindowDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, SlidingWindowState>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  hit(key: string, now = Date.now()): SlidingWindowDecision {
    const bucket = this.buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((timestamp) => now - timestamp < this.windowMs);

    if (bucket.hits.length >= this.limit) {
      const retryAfterMs = Math.max(this.windowMs - (now - bucket.hits[0]), 0);
      this.buckets.set(key, bucket);
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        remaining: 0
      };
    }

    bucket.hits.push(now);
    this.buckets.set(key, bucket);
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(this.limit - bucket.hits.length, 0)
    };
  }

  reset(key: string) {
    this.buckets.delete(key);
  }
}

export function isAllowedCorsOrigin(origin: string | undefined, appBaseUrl: string) {
  if (!origin) {
    return true;
  }

  if (origin === 'capacitor://localhost' || origin === 'ionic://localhost') {
    return true;
  }

  try {
    const requestUrl = new URL(origin);
    const appUrl = new URL(appBaseUrl);

    if (requestUrl.origin === appUrl.origin) {
      return true;
    }

    if (requestUrl.protocol === 'http:' && (requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1')) {
      return true;
    }

    if (requestUrl.protocol === 'https:' && requestUrl.hostname.endsWith('.trycloudflare.com')) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function sanitizeDownloadFileName(fileName: string) {
  return fileName
    .replace(/[\u0000-\u001f\u007f]+/g, '')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .trim()
    .slice(0, 180) || 'download';
}

