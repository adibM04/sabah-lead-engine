import type { Lead } from "./types";

// Lead score, 0 to 85. Must match the SQL in migrations/0005 and score_lead() in pipeline/lead_engine.py.
const SOCIAL = ["facebook.com", "instagram.com", "linktr.ee", "carrd.co", "beacons.ai"];

export interface ScoreInput {
  website: string | null;
  uses_linktree: boolean | number | null;
  reviews_count: number | null;
  rating: number | null;
  email: string | null;
  phone: string | null;
}

export function scoreParts(l: ScoreInput): { label: string; points: number }[] {
  const parts: { label: string; points: number }[] = [];
  const site = (l.website ?? "").trim();
  if (!site) parts.push({ label: "No website", points: 40 });
  else if (l.uses_linktree || SOCIAL.some((h) => site.includes(h))) parts.push({ label: "Social page only", points: 30 });
  else parts.push({ label: "Has a website", points: 10 });

  const reviews = Math.floor((Math.min(l.reviews_count ?? 0, 500) * 20) / 500);
  parts.push({ label: `${l.reviews_count ?? 0} reviews`, points: reviews });

  const rating = l.rating ?? 0;
  parts.push({ label: rating ? `Rated ${rating.toFixed(1)}` : "No rating", points: rating >= 4.5 ? 10 : rating >= 4 ? 5 : 0 });

  if (l.email) parts.push({ label: "Email found", points: 15 });
  else if (l.phone) parts.push({ label: "Phone only", points: 5 });
  else parts.push({ label: "No contact", points: 0 });
  return parts;
}

export const scoreTotal = (l: ScoreInput): number => scoreParts(l).reduce((n, p) => n + p.points, 0);

/** Stored score when the pipeline has set one, otherwise worked out here. */
export const leadScore = (l: Lead): number => l.score ?? scoreTotal(l);

export const scoreSummary = (l: Lead): string =>
  scoreParts(l)
    .filter((p) => p.points > 0)
    .map((p) => `${p.label} +${p.points}`)
    .join(", ");
