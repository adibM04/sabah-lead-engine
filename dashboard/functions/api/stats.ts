import type { Env } from "../_lib/access";

// Contacted = anything that got as far as being sent. Replied includes won.
const BASE = `
  COUNT(*) AS leads,
  SUM(CASE WHEN sent_at IS NOT NULL OR status IN ('sent','whatsapp','replied','follow_up','won') THEN 1 ELSE 0 END) AS contacted,
  SUM(CASE WHEN status IN ('replied','won') THEN 1 ELSE 0 END) AS replied,
  SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS won`;

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const group = (col: string) =>
    env.DB.prepare(`SELECT ${col} AS label, ${BASE} FROM leads WHERE ${col} IS NOT NULL AND ${col} != '' GROUP BY ${col} ORDER BY leads DESC LIMIT 12`).all();

  const [total, byStatus, byCategory, byPitch, byVersion] = await Promise.all([
    env.DB.prepare(`SELECT ${BASE} FROM leads`).first(),
    env.DB.prepare("SELECT status AS label, COUNT(*) AS leads FROM leads GROUP BY status").all(),
    group("category"),
    group("pitch_type"),
    group("playbook_version"),
  ]);

  return Response.json(
    { total, by_status: byStatus.results, by_category: byCategory.results, by_pitch: byPitch.results, by_playbook: byVersion.results },
    { headers: { "Cache-Control": "no-store" } },
  );
};
