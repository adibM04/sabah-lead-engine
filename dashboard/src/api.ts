import type { Digest, Lead, PlaybookState, SearchQuery, SettingsState } from "./types";

async function check(res: Response): Promise<Response> {
  if (res.ok) return res;
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // keep the status message
  }
  throw new Error(message);
}

export async function fetchLeads(): Promise<Lead[]> {
  const res = await check(await fetch("/api/leads"));
  return (await res.json()) as Lead[];
}

export async function updateLead(id: string, changes: Partial<Lead>): Promise<void> {
  await check(
    await fetch(`/api/leads/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    }),
  );
}

async function send(url: string, method: string, body?: unknown): Promise<void> {
  await check(
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

export async function fetchPlaybook(): Promise<PlaybookState> {
  return (await (await check(await fetch("/api/playbook"))).json()) as PlaybookState;
}
export const decidePlaybook = (version: number, action: "approve" | "reject") =>
  send(`/api/playbook/${version}`, "POST", { action });

export async function fetchDigest(): Promise<Digest | null> {
  return (await (await check(await fetch("/api/digest"))).json()) as Digest | null;
}

export async function fetchQueries(): Promise<SearchQuery[]> {
  return (await (await check(await fetch("/api/queries"))).json()) as SearchQuery[];
}
export const setQueryStatus = (id: number, status: SearchQuery["status"]) => send(`/api/queries/${id}`, "PATCH", { status });

export async function fetchSettings(): Promise<SettingsState> {
  return (await (await check(await fetch("/api/settings"))).json()) as SettingsState;
}
export const saveSecret = (name: string, value: string) => send(`/api/settings/${name}`, "PUT", { value });
export const removeSecret = (name: string) => send(`/api/settings/${name}`, "DELETE");
