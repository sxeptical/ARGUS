const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_REQUESTS = 30;

interface WindowEntry {
  count: number;
  windowStart: number;
}

const ipWindows = new Map<string, WindowEntry>();
const MAX_ENTRIES = 10_000;

const IP_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

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

function evictStale(): void {
  const now = Date.now();
  for (const [key, entry] of ipWindows) {
    if (now - entry.windowStart > DEFAULT_WINDOW_MS * 2) {
      ipWindows.delete(key);
    }
  }
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
  if (forwarded) {
    const candidate = forwarded.split(",")[0].trim();
    if (IP_RE.test(candidate)) return candidate;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && IP_RE.test(realIp)) return realIp;

  evictStale();
  return `anonymous:${request.headers.get("user-agent")?.slice(0, 64) ?? "unknown"}`;
}
