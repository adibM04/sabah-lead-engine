import type { Env } from "../_lib/access";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const row = await env.DB.prepare(
    "SELECT id, ran_at, digest, playbook_version FROM weekly_runs ORDER BY id DESC LIMIT 1",
  ).first();
  return Response.json(row ?? null);
};
