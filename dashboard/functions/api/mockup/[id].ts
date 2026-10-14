import type { Env } from "../../_lib/access";

// Serves a stored mock-up. The page may not run scripts or load anything from outside,
// whatever the stored HTML says.
export const onRequestGet: PagesFunction<Env, "id"> = async ({ env, params, request }) => {
  const row = await env.DB.prepare("SELECT business_name, mockup_html FROM leads WHERE id = ?")
    .bind(String(params.id))
    .first<{ business_name: string; mockup_html: string | null }>();
  if (!row?.mockup_html) return new Response("No mock-up yet", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; sandbox",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  };
  if (new URL(request.url).searchParams.has("download")) {
    const slug = row.business_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mockup";
    headers["Content-Disposition"] = `attachment; filename="${slug}-concept.html"`;
  }
  return new Response(row.mockup_html, { headers });
};
