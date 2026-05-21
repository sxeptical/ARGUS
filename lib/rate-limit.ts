const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_REQUESTS = 30;

interface WindowEntry {
  count: number;
  windowStart: number;
}

const ipWindows = new Map<string, WindowEntry>();
const MAX_ENTRIES = 10_000;

function evictOldestIfNeeded(): void {
  if (ipWindows.size < MAX_ENTRIES) return;
  let oldestKey = "";
  let oldest = Infinity;
  for (const [key, entry] of ipWindows) {
    if (entry.windowStart < oldest) {
      oldest = entry.windowStart;
      oldestKey = key;
    }
  }
  if (oldestKey) ipWindows.delete(oldestKey);
}

export function checkRateLimit(
  ip: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS,
  windowMs: number = DEFAULT_WINDOW_MS,
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const entry = ipWindows.get(ip);

  if (!entry || now - entry.windowStart > windowMs) {
    evictOldestIfNeeded();
    ipWindows.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1, resetMs: windowMs };
  }

  entry.count += 1;
  const remaining = Math.max(0, maxRequests - entry.count);
  const resetMs = Math.max(0, entry.windowStart + windowMs - now);

  return { allowed: entry.count <= maxRequests, remaining, resetMs };
}

export function extractClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  const realIp = request.headers.get("x-real-ip");
  return realIp ?? "127.0.0.1";
}
