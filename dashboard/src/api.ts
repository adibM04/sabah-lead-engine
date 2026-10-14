import type { Lead } from "./types";

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
