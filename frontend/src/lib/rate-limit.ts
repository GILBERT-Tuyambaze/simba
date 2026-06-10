type RateLimitEntry = {
  count: number;
  windowStart: number;
};

const store = new Map<string, RateLimitEntry>();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return 'unknown';
}

function cleanup(now: number): void {
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart > 60_000) {
      store.delete(key);
    }
  }
}

export type RateLimitConfig = {
  route: string;
  maxRequests: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  clientIp: string;
};

export function checkRateLimit(
  request: Request,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const clientIp = getClientIp(request);
  const key = `${config.route}:${clientIp}`;

  if (now % 100 < 2) {
    cleanup(now);
  }

  const entry = store.get(key);

  if (!entry || now - entry.windowStart > config.windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      retryAfterMs: 0,
      clientIp,
    };
  }

  entry.count += 1;

  if (entry.count > config.maxRequests) {
    const retryAfterMs = config.windowMs - (now - entry.windowStart);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 1000),
      clientIp,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    retryAfterMs: 0,
    clientIp,
  };
}
