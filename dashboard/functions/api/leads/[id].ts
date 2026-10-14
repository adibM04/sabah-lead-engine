import type { Env } from "../../_lib/access";

const STATUSES = ["new", "approved", "sent", "whatsapp", "replied", "follow_up", "won", "lost", "skipped"];

// Only these columns can be changed from the dashboard.
const EDITABLE = ["status", "notes", "draft_edited", "whatsapp_edited", "outcome_reason", "sent_at", "follow_up_at"] as const;

export const onRequestPatch: PagesFunction<Env, "id"> = async ({ request, env, params }) => {
  const id = String(params.id);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const sets: string[] = [];
  const values: unknown[] = [];

  if ("redraft" in body) {
    if (typeof body.redraft !== "boolean") {
      return Response.json({ error: "redraft must be true or false" }, { status: 400 });
    }
    sets.push("redraft = ?");
    values.push(body.redraft ? 1 : 0);
  }

  if ("mockup" in body) {
    if (body.mockup !== "request") {
      return Response.json({ error: 'mockup can only be "request"' }, { status: 400 });
    }
    const l = await env.DB.prepare("SELECT website FROM leads WHERE id = ?").bind(id).first<{ website: string | null }>();
    if (!l) return Response.json({ error: "Lead not found" }, { status: 404 });
    if (!l.website) return Response.json({ error: "This business has no website to base a mock-up on" }, { status: 400 });
    sets.push("mockup_status = 'requested'");
  }

  for (const col of EDITABLE) {
    if (!(col in body)) continue;
    const v = body[col];
    if (v !== null && typeof v !== "string") {
      return Response.json({ error: `${col} must be a string or null` }, { status: 400 });
    }
    if (col === "status" && (v === null || !STATUSES.includes(v))) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }
    if (typeof v === "string" && v.length > 20_000) {
      return Response.json({ error: `${col} is too long` }, { status: 400 });
    }
    sets.push(`${col} = ?`);
    values.push(v);
  }

  if (sets.length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const res = await env.DB.prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values, id)
    .run();

  if (res.meta.changes === 0) return Response.json({ error: "Lead not found" }, { status: 404 });
  return Response.json({ ok: true });
};
