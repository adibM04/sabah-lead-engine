import type { Env } from "../../_lib/access";

interface Row extends Record<string, unknown> {
  all_emails: string;
  has_whatsapp_link: number;
  uses_linktree: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    "SELECT * FROM leads ORDER BY created_at DESC LIMIT 2000",
  ).all<Row>();

  const leads = results.map((r) => ({
    ...r,
    all_emails: safeArray(r.all_emails),
    has_whatsapp_link: r.has_whatsapp_link === 1,
    uses_linktree: r.uses_linktree === 1,
  }));
  return Response.json(leads);
};

function safeArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
