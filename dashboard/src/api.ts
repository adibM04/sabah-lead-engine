import type { Digest, Lead, LeadChanges, PlaybookState, ReplyAnalysis, ScansState, SearchQuery, SettingsState, Stats } from "./types";

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

export async function updateLead(id: string, changes: LeadChanges): Promise<void> {
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

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Streams a reply from /api/chat, calling onText with each new piece as it arrives. */
export async function streamChat(
  messages: ChatMessage[],
  leadId: string | null,
  onText: (piece: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await check(
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, lead_id: leadId }),
      signal,
    }),
  );
  if (!res.body) throw new Error("The reply came back empty");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onText(decoder.decode(value, { stream: true }));
  }
}

export async function fetchScans(): Promise<ScansState> {
  return (await (await check(await fetch("/api/scans", { cache: "no-store" }))).json()) as ScansState;
}
export const requestScan = (query: string, maxResults: number) => send("/api/scans", "POST", { query, max_results: maxResults });

export async function fetchStats(): Promise<Stats> {
  return (await (await check(await fetch("/api/stats", { cache: "no-store" }))).json()) as Stats;
}

export async function analyseReply(leadId: string, reply: string): Promise<ReplyAnalysis> {
  const res = await check(
    await fetch("/api/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, reply }),
    }),
  );
  return (await res.json()) as ReplyAnalysis;
}
