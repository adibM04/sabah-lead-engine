// Verifies the Cloudflare Access JWT on every API request, so the API is
// locked even if someone reaches the *.pages.dev URL directly.

export interface Env {
  DB: D1Database;
  ACCESS_TEAM_DOMAIN?: string; // e.g. yourteam.cloudflareaccess.com
  ACCESS_AUD?: string; // Access application AUD tag
  DEV_BYPASS?: string; // "1" for local wrangler dev only
}

interface CertKey extends JsonWebKey {
  kid?: string;
}

let certCache: { team: string; at: number; keys: CertKey[] } | null = null;

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function parseJson(s: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function getKeys(team: string): Promise<CertKey[]> {
  if (certCache && certCache.team === team && Date.now() - certCache.at < 3_600_000) {
    return certCache.keys;
  }
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys: CertKey[] };
  certCache = { team, at: Date.now(), keys: body.keys };
  return body.keys;
}

export async function isAuthorized(request: Request, env: Env): Promise<boolean> {
  if (env.DEV_BYPASS === "1") return true;

  const team = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!team || !aud || !token) return false;

  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return false;

  try {
    const header = parseJson(h) as { alg?: string; kid?: string };
    const payload = parseJson(p) as { aud?: string | string[]; exp?: number; iss?: string };
    if (header.alg !== "RS256") return false;

    const jwk = (await getKeys(team)).find((k) => k.kid === header.kid);
    if (!jwk) return false;

    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    if (!valid) return false;

    const audOk = Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud === aud;
    const fresh = typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
    const issOk = payload.iss === `https://${team}`;
    return audOk && fresh && issOk;
  } catch {
    return false;
  }
}
