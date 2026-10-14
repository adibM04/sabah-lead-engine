import { isAuthorized, type Env } from "./_lib/access";

// Gate the whole site (pages and API) behind the shared password.
// The browser shows its own login box; use any username.
export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (!(await isAuthorized(ctx.request, ctx.env))) {
    return new Response("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Lead desk", charset="UTF-8"' },
    });
  }

  // Browsers re-send saved Basic credentials on cross-site requests, so a foreign page
  // could otherwise trigger writes. Writes must come from this site's own pages.
  const m = ctx.request.method;
  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
    const origin = ctx.request.headers.get("Origin");
    if (origin !== new URL(ctx.request.url).origin) {
      return Response.json({ error: "Cross-site request blocked" }, { status: 403 });
    }
  }
  return ctx.next();
};
