import { isAuthorized, type Env } from "../_lib/access";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (!(await isAuthorized(ctx.request, ctx.env))) {
    return Response.json({ error: "Not authorised" }, { status: 401 });
  }
  return ctx.next();
};
