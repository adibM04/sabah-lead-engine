import type { Env } from "../../_lib/access";

// Approve or reject a proposed playbook. Only 'proposed' rows can be decided,
// so an old version can never be re-activated by accident.
export const onRequestPost: PagesFunction<Env, "version"> = async ({ request, env, params }) => {
  const version = Number(params.version);
  if (!Number.isInteger(version)) return Response.json({ error: "Bad version" }, { status: 400 });

  let action: unknown;
  try {
    action = ((await request.json()) as { action?: unknown }).action;
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (action !== "approve" && action !== "reject") {
    return Response.json({ error: "action must be approve or reject" }, { status: 400 });
  }

  const row = await env.DB.prepare("SELECT status FROM playbook WHERE version = ?").bind(version).first<{ status: string }>();
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  if (row.status !== "proposed") return Response.json({ error: "Only a proposed playbook can be decided" }, { status: 409 });

  const now = new Date().toISOString();
  if (action === "approve") {
    await env.DB.batch([
      env.DB.prepare("UPDATE playbook SET status = 'retired' WHERE status = 'active'"),
      env.DB.prepare("UPDATE playbook SET status = 'active', decided_at = ? WHERE version = ? AND status = 'proposed'").bind(now, version),
    ]);
  } else {
    await env.DB.prepare("UPDATE playbook SET status = 'rejected', decided_at = ? WHERE version = ? AND status = 'proposed'").bind(now, version).run();
  }
  return Response.json({ ok: true });
};
