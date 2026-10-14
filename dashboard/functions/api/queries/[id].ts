import type { Env } from "../../_lib/access";

export const onRequestPatch: PagesFunction<Env, "id"> = async ({ request, env, params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return Response.json({ error: "Bad id" }, { status: 400 });

  let status: unknown;
  try {
    status = ((await request.json()) as { status?: unknown }).status;
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (status !== "active" && status !== "rejected" && status !== "suggested") {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }
  const res = await env.DB.prepare("UPDATE search_queries SET status = ? WHERE id = ?").bind(status, id).run();
  if (res.meta.changes === 0) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
};
