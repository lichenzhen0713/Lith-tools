import crypto from 'node:crypto';

/** Application error with an HTTP status code. */
export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, details);
  }
  static unauthorized(message = '请先登录') {
    return new ApiError(401, message);
  }
  static forbidden(message = '没有操作权限') {
    return new ApiError(403, message);
  }
  static notFound(message = '内容不存在') {
    return new ApiError(404, message);
  }
  static conflict(message: string) {
    return new ApiError(409, message);
  }
  static tooMany(message = '操作过于频繁，请稍后再试') {
    return new ApiError(429, message);
  }
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
  return `scrypt$${scryptParams()}${salt}$${hash.toString('hex')}`;
}

function scryptParams(): string {
  return `${SCRYPT_PARAMS.N}.${SCRYPT_PARAMS.r}.${SCRYPT_PARAMS.p}$`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, params, salt, expected] = stored.split('$');
    if (scheme !== 'scrypt' || !params || !salt || !expected) return false;
    const [N, r, p] = params.split('.').map(Number);
    const derived = crypto.scryptSync(password, salt, Buffer.from(expected, 'hex').length, { N, r, p });
    const expectedBuffer = Buffer.from(expected, 'hex');
    return derived.length === expectedBuffer.length && crypto.timingSafeEqual(derived, expectedBuffer);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function randomCode(digits = 6): string {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return String(crypto.randomInt(min, max + 1));
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// --------------------------------------------------------------------------
// Sliding-window rate limiter (in-process; suitable for a single-node app)
// --------------------------------------------------------------------------

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
    lastSweep = now;
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000);
    throw new ApiError(429, `操作过于频繁，请 ${seconds} 秒后再试`);
  }
}

export function resetRateLimit(prefix: string): void {
  for (const key of buckets.keys()) {
    if (key.startsWith(prefix)) buckets.delete(key);
  }
}
