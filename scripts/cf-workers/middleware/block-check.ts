interface KVNamespace {
  get(key: string): Promise<string | null>;
}

export interface BlockCheckEnv {
  HONEYPOT_BLOCKLIST: KVNamespace;
}

const BLOCKLIST_PREFIX = "ip:";

export async function blockKnownScraper(
  request: Request,
  env: BlockCheckEnv,
): Promise<Response | null> {
  const ip = clientIp(request);

  if (!ip) {
    return null;
  }

  const blocklistHit = await env.HONEYPOT_BLOCKLIST.get(blocklistKey(ip));

  if (!blocklistHit) {
    return null;
  }

  return new Response("Forbidden\n", {
    status: 403,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export default {
  async fetch(request: Request, env: BlockCheckEnv): Promise<Response> {
    const blocked = await blockKnownScraper(request, env);

    if (blocked) {
      return blocked;
    }

    return fetch(request);
  },
};

function clientIp(request: Request): string {
  const cfConnectingIp = request.headers.get("CF-Connecting-IP");
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }

  const forwardedFor = request.headers.get("X-Forwarded-For");
  if (!forwardedFor) {
    return "";
  }

  return forwardedFor.split(",")[0]?.trim() ?? "";
}

function blocklistKey(ip: string): string {
  return `${BLOCKLIST_PREFIX}${ip}`;
}
