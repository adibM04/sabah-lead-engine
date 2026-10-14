import type { Env } from "./access";
import { decrypt } from "./crypto";

// The DeepSeek key: a Pages variable wins, otherwise the encrypted value saved from the Settings page.
export async function deepseekKey(env: Env): Promise<string | null> {
  if (env.DEEPSEEK_API_KEY) return env.DEEPSEEK_API_KEY;
  if (!env.SETTINGS_KEY) return null;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE name = 'deepseek_key'").first<{ value: string }>();
  if (!row) return null;
  try {
    return await decrypt(row.value, env.SETTINGS_KEY);
  } catch {
    return null; // wrong SETTINGS_KEY or corrupted value
  }
}
