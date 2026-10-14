import type { Env } from "../../_lib/access";


// Reports which keys are set. Values are never sent back to the browser.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare("SELECT name, hint, updated_at FROM settings").all<{
    name: string;
    hint: string | null;
    updated_at: string;
  }>();
  return Response.json({
    encryption_ready: Boolean(env.SETTINGS_KEY && env.SETTINGS_KEY.length >= 16),
    keys: Object.fromEntries(results.map((r) => [r.name, { hint: r.hint, updated_at: r.updated_at }])),
  });
};
