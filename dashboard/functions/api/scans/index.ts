import type { Env } from "../../_lib/access";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [runs, requests] = await Promise.all([
    env.DB.prepare(
      "SELECT id, source, status, phase, queries, started_at, finished_at, heartbeat_at, found, to_process, processed, new_leads, skipped, failed, error FROM scan_runs ORDER BY id DESC LIMIT 30",
    ).all(),
    env.DB.prepare(
      "SELECT id, query, max_results, status, requested_at, run_id, error FROM scan_requests ORDER BY id DESC LIMIT 15",
    ).all(),
  ]);
  return Response.json(
    {
      runs: runs.results.map((r) => ({ ...r, queries: parseList(r.queries) })),
      requests: requests.results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};

// "Scan now": queue a search. The pipeline on the AWS box picks it up within a couple of minutes.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { query?: unknown; max_results?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (query.length < 3 || query.length > 120) {
    return Response.json({ error: "Search must be 3 to 120 characters, for example: dental clinic in Kota Kinabalu" }, { status: 400 });
  }
  const max = Number(body.max_results ?? 10);
  if (!Number.isInteger(max) || max < 1 || max > 30) {
    return Response.json({ error: "Number of businesses must be between 1 and 30" }, { status: 400 });
  }

  const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM scan_requests WHERE status IN ('pending','running')").first<{ n: number }>();
  if ((open?.n ?? 0) >= 5) {
    return Response.json({ error: "Five scans are already waiting. Let them finish first." }, { status: 429 });
  }

  const res = await env.DB.prepare("INSERT INTO scan_requests (query, max_results) VALUES (?, ?)").bind(query, max).run();
  return Response.json({ ok: true, id: res.meta.last_row_id });
};

function parseList(s: unknown): string[] {
  try {
    const v = JSON.parse(String(s));
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
