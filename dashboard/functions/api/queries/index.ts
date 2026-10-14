import type { Env } from "../../_lib/access";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    "SELECT id, query, status, reason, created_at FROM search_queries ORDER BY status = 'suggested' DESC, id DESC LIMIT 200",
  ).all();
  return Response.json(results);
};
