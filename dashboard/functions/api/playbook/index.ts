import type { Env } from "../../_lib/access";

interface PlaybookRow {
  version: number;
  content: string;
  status: string;
  rationale: string | null;
  created_at: string;
  decided_at: string | null;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    "SELECT version, content, status, rationale, created_at, decided_at FROM playbook ORDER BY version DESC LIMIT 15",
  ).all<PlaybookRow>();
  const active = results.find((r) => r.status === "active") ?? null;
  const proposed = results.find((r) => r.status === "proposed") ?? null;
  const history = results.filter((r) => r.status !== "proposed" && r.status !== "active");
  return Response.json({ active, proposed, history });
};
