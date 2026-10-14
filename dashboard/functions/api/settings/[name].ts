import type { Env } from "../../_lib/access";
import { encrypt } from "../../_lib/crypto";

const NAMES = ["deepseek_key", "apify_token"];

export const onRequestPut: PagesFunction<Env, "name"> = async ({ request, env, params }) => {
  const name = String(params.name);
  if (!NAMES.includes(name)) return Response.json({ error: "Unknown setting" }, { status: 404 });
  if (!env.SETTINGS_KEY || env.SETTINGS_KEY.length < 16) {
    return Response.json({ error: "SETTINGS_KEY is not set on the Pages project (needs 16+ characters)" }, { status: 503 });
  }

  let value: unknown;
  try {
    value = ((await request.json()) as { value?: unknown }).value;
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (typeof value !== "string" || value.trim().length < 8 || value.length > 500) {
    return Response.json({ error: "That does not look like an API key" }, { status: 400 });
  }
  const clean = value.trim();

  await env.DB.prepare(
    "INSERT INTO settings (name, value, hint, updated_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(name) DO UPDATE SET value = excluded.value, hint = excluded.hint, updated_at = excluded.updated_at",
  )
    .bind(name, await encrypt(clean, env.SETTINGS_KEY), clean.slice(-4), new Date().toISOString())
    .run();
  return Response.json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env, "name"> = async ({ env, params }) => {
  const name = String(params.name);
  if (!NAMES.includes(name)) return Response.json({ error: "Unknown setting" }, { status: 404 });
  await env.DB.prepare("DELETE FROM settings WHERE name = ?").bind(name).run();
  return Response.json({ ok: true });
};
