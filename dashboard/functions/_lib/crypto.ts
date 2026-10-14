// AES-256-GCM for API keys entered in the dashboard. Format: v1.<b64 iv>.<b64 ciphertext+tag>
// The Python pipeline decrypts the same format (pipeline/db.py).

async function key(master: string, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(master));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [usage]);
}

function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
}

export async function encrypt(plain: string, master: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(master, "encrypt"), new TextEncoder().encode(plain));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function decrypt(blob: string, master: string): Promise<string> {
  const [version, iv, ct] = blob.split(".");
  if (version !== "v1" || !iv || !ct) throw new Error("Unknown secret format");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await key(master, "decrypt"), fromB64(ct));
  return new TextDecoder().decode(plain);
}
