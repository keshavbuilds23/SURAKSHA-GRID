import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types/index.js';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

/**
 * Lightweight, zero-dependency sliding window rate limiter.
 * Limits excessive requests per IP address to safeguard the disaster coordination API.
 * Includes bounded memory footprint to prevent memory exhaustion under distributed spoofing.
 */
export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  maxTrackedIps?: number;
}) {
  const maxTrackedIps = options.maxTrackedIps || 10000;
  const ipStore = new Map<string, RateLimitRecord>();

  // Periodically clean up stale client entries every 2 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipStore.entries()) {
      if (now > record.resetAt) {
        ipStore.delete(ip);
      }
    }
  }, 120000).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip rate limiting during automated test execution
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    // Guard: Prevent memory bloat if map size exceeds ceiling
    if (ipStore.size >= maxTrackedIps && !ipStore.has(clientIp)) {
      // Evict expired entries or the oldest entry
      for (const [ip, rec] of ipStore.entries()) {
        if (now > rec.resetAt) {
          ipStore.delete(ip);
        }
      }
      if (ipStore.size >= maxTrackedIps) {
        const firstKey = ipStore.keys().next().value;
        if (firstKey) ipStore.delete(firstKey);
      }
    }

    const record = ipStore.get(clientIp);

    if (!record || now > record.resetAt) {
      ipStore.set(clientIp, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      res.setHeader('X-RateLimit-Limit', options.maxRequests);
      res.setHeader('X-RateLimit-Remaining', options.maxRequests - 1);
      return next();
    }

    if (record.count >= options.maxRequests) {
      const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      res.setHeader('X-RateLimit-Limit', options.maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      return next(
        new AppError(
          'Too many requests. Rate limit exceeded. Please retry shortly.',
          429,
          'RATE_LIMIT_EXCEEDED'
        )
      );
    }

    record.count += 1;
    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', options.maxRequests - record.count);
    return next();
  };
}

