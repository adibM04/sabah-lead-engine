import type { Env } from "../_lib/access";
import { LEAD_COLS } from "../_lib/leadcols";

const CSV_COLS = [
  "business_name", "category", "area", "status", "score", "pitch_type", "phone", "email", "website", "google_maps_url",
  "rating", "reviews_count", "email_subject", "email_draft", "draft_edited", "whatsapp_draft", "whatsapp_edited",
  "notes", "outcome_reason", "sent_at", "follow_up_at", "created_at",
];

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Stop spreadsheet apps treating text from a scraped site as a formula.
  if (/^[=+\-@\t\r]/.test(s) && !/^\+[\d\s-]+$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Everything except saved API keys. Mock-ups are not included, they can be rebuilt.
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const format = new URL(request.url).searchParams.get("format") ?? "json";
  const stamp = new Date().toISOString().slice(0, 10);
  const { results: leads } = await env.DB.prepare(`SELECT ${LEAD_COLS} FROM leads ORDER BY created_at DESC`).all<Record<string, unknown>>();

  if (format === "csv") {
    const lines = [CSV_COLS.join(",")];
    for (const l of leads) lines.push(CSV_COLS.map((c) => cell(l[c])).join(","));
    return new Response("﻿" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sabah-leads-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (format !== "json") return Response.json({ error: "format must be csv or json" }, { status: 400 });

  const all = (sql: string) => env.DB.prepare(sql).all().then((r) => r.results);
  const [playbook, searchQueries, weeklyRuns, scanRuns] = await Promise.all([
    all("SELECT * FROM playbook ORDER BY version"),
    all("SELECT * FROM search_queries ORDER BY id"),
    all("SELECT * FROM weekly_runs ORDER BY id"),
    all("SELECT * FROM scan_runs ORDER BY id"),
  ]);
  const body = JSON.stringify({ exported_at: new Date().toISOString(), leads, playbook, search_queries: searchQueries, weekly_runs: weeklyRuns, scan_runs: scanRuns }, null, 1);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="sabah-leads-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
};
