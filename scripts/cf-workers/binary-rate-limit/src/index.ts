const DAILY_REQUEST_CAP = 500;
const COUNTER_TTL_SECONDS = 48 * 60 * 60;
const SUPPORT_URL = "https://gamedev.trebeljahr.com/supporters";

type BinaryRequestCounts = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: {
      expirationTtl?: number;
    },
  ): Promise<void>;
};

type Env = {
  BINARY_REQ_COUNTS: BinaryRequestCounts;
};

function jsonResponse(body: Record<string, string>, status: number, extraHeaders?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function clientIp(request: Request): string {
  const cloudflareIp = request.headers.get("CF-Connecting-IP")?.trim();
  if (cloudflareIp) return cloudflareIp;

  const forwardedIp = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  return forwardedIp || "unknown";
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function secondsUntilNextUtcDay(date: Date): number {
  const nextDay = new Date(date);
  nextDay.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((nextDay.getTime() - date.getTime()) / 1000));
}

function counterKey(request: Request, date: Date): string {
  return `${clientIp(request)}:${utcDateKey(date)}`;
}

function parseCount(value: string | null): number {
  if (!value) return 0;
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return fetch(request);
    }

    const now = new Date();
    const key = counterKey(request, now);
    const currentCount = parseCount(await env.BINARY_REQ_COUNTS.get(key));

    if (currentCount >= DAILY_REQUEST_CAP) {
      return jsonResponse(
        {
          error: "daily binary request cap reached",
          supportUrl: SUPPORT_URL,
        },
        429,
        {
          "Retry-After": String(secondsUntilNextUtcDay(now)),
        },
      );
    }

    await env.BINARY_REQ_COUNTS.put(key, String(currentCount + 1), {
      expirationTtl: COUNTER_TTL_SECONDS,
    });

    return fetch(request);
  },
};
