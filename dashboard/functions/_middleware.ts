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
  return ctx.next();
};
