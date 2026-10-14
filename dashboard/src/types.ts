export type LeadStatus =
  | "new"
  | "approved"
  | "sent"
  | "whatsapp"
  | "replied"
  | "follow_up"
  | "won"
  | "lost"
  | "skipped";

export interface Lead {
  id: string;
  place_id: string;
  search_query: string | null;
  business_name: string;
  category: string | null;
  area: string | null;
  address: string | null;
  phone: string | null;
  whatsapp_link: string | null;
  website: string | null;
  google_maps_url: string | null;
  rating: number | null;
  reviews_count: number | null;
  email: string | null;
  all_emails: string[] | null;
  has_whatsapp_link: boolean | null;
  uses_linktree: boolean | null;
  detected_bottleneck: string | null;
  email_subject: string | null;
  observation_hook: string | null;
  custom_fix: string | null;
  email_draft: string | null;
  draft_edited: string | null;
  whatsapp_draft: string | null;
  whatsapp_edited: string | null;
  pitch_type: string | null;
  draft_flags: string | null;
  playbook_version: number | null;
  outcome_reason: string | null;
  followup_draft: string | null;
  followup_channel: string | null;
  redraft: boolean | number | null;
  status: LeadStatus;
  notes: string | null;
  sent_at: string | null;
  follow_up_at: string | null;
  created_at: string;
  updated_at: string;
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "To review",
  approved: "Approved",
  sent: "Sent",
  whatsapp: "WhatsApp sent",
  replied: "Replied",
  follow_up: "Follow up",
  won: "Won",
  lost: "Lost",
  skipped: "Skipped",
};

export interface Group {
  key: string;
  label: string;
  statuses: LeadStatus[];
}

export const GROUPS: Group[] = [
  { key: "review", label: "To review", statuses: ["new"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "sent", label: "Sent", statuses: ["sent", "whatsapp"] },
  { key: "follow_up", label: "Follow up", statuses: ["follow_up"] },
  { key: "replied", label: "Replied", statuses: ["replied", "won"] },
  { key: "closed", label: "Closed", statuses: ["lost", "skipped"] },
];

export interface PlaybookRow {
  version: number;
  content: string;
  status: string;
  rationale: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface PlaybookState {
  active: PlaybookRow | null;
  proposed: PlaybookRow | null;
  history: PlaybookRow[];
}

export interface Digest {
  id: number;
  ran_at: string;
  digest: string;
  playbook_version: number | null;
}

export interface SearchQuery {
  id: number;
  query: string;
  status: "suggested" | "active" | "rejected";
  reason: string | null;
  created_at: string;
}

export interface SettingsState {
  encryption_ready: boolean;
  keys: Record<string, { hint: string | null; updated_at: string }>;
}

export const OUTCOME_REASONS = [
  "Wrong fit",
  "No reply",
  "Not interested",
  "Too salesy",
  "Already has a developer",
  "Wrong contact",
  "Other",
];
