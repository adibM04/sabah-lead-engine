import type { Env } from "../../_lib/access";
import { deepseekKey } from "../../_lib/secrets";

const UA = { "User-Agent": "Mozilla/5.0" };

// Jina's reader gives clean article text; raw HTML (tags stripped) is the fallback when
// the reader is unavailable or rate-limited.
async function readableText(url: string): Promise<string> {
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, { headers: UA, signal: AbortSignal.timeout(12000) });
    if (r.ok) {
      const t = (await r.text()).trim();
      if (t) return t.slice(0, 6000);
    }
  } catch {
    // fall through to raw HTML
  }
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(12000) });
    if (r.ok) {
      const text = (await r.text())
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) return text.slice(0, 6000);
    }
  } catch {
    // both failed
  }
  return "";
}

// Reads a lead's current website live and asks DeepSeek for a short report: what they have,
// what's missing, and what to propose. Nothing is stored; read on demand.
export const onRequestPost: PagesFunction<Env, "id"> = async ({ env, params }) => {
  const lead = await env.DB.prepare("SELECT business_name, category, website FROM leads WHERE id = ?")
    .bind(String(params.id))
    .first<{ business_name: string; category: string | null; website: string | null }>();
  if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });
  if (!lead.website) return Response.json({ error: "This lead has no website" }, { status: 400 });

  const key = await deepseekKey(env);
  if (!key) return Response.json({ error: "No DeepSeek key found. Add it under Settings." }, { status: 503 });

  const pageText = await readableText(lead.website);
  if (!pageText) {
    return Response.json({ error: "Could not read their website. It may block automated requests." }, { status: 502 });
  }

  const system = [
    "You read a business's website for Adib, CTO of Smart Native Maker, a studio in Kota Kinabalu that builds websites and booking or job-tracking systems for small Sabah businesses, before he pitches them.",
    "Write a short plain-text report in three short paragraphs, no markdown headers or bullets:",
    "1) What they have: what the site currently offers and how someone would book or buy.",
    "2) What's missing: gaps that would stop a customer from booking or buying, grounded only in the page text given.",
    "3) What to propose: the single strongest, most specific thing to pitch them.",
    "Ground every claim in the page text. If it's thin or unclear, say so instead of guessing. English only.",
  ].join("\n\n");
  const user = `Business: ${lead.business_name}${lead.category ? ` (${lead.category})` : ""}\nWebsite: ${lead.website}\n\nPage text:\n${pageText}`;

  const upstream = await fetch(`${env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-v4-pro",
      max_tokens: 6000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!upstream.ok) {
    const hint =
      upstream.status === 401 ? "DeepSeek rejected the key. Save a new one under Settings."
      : upstream.status === 402 ? "DeepSeek says the account is out of balance."
      : upstream.status === 429 ? "DeepSeek is rate limiting. Try again in a moment."
      : `DeepSeek returned ${upstream.status}.`;
    return Response.json({ error: hint }, { status: 502 });
  }

  const data = (await upstream.json()) as { choices?: { message?: { content?: string } }[] };
  const report = data.choices?.[0]?.message?.content?.trim();
  if (!report) return Response.json({ error: "The model sent nothing back. Try again." }, { status: 502 });

  return Response.json({ report });
};
