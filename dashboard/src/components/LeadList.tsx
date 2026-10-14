import type { Lead } from "../types";
import StatusChip from "./StatusChip";

interface Props {
  leads: Lead[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function contactLabel(l: Lead): string {
  if (l.email) return "Email found";
  if (l.phone) return "WhatsApp only";
  return "No contact";
}

export default function LeadList({ leads, selectedId, onSelect }: Props) {
  if (leads.length === 0) {
    return (
      <div className="empty">
        <p>No leads match these filters.</p>
        <p className="muted">Run the pipeline to pull in a new batch, or clear a filter.</p>
      </div>
    );
  }

  return (
    <ul className="lead-list" role="listbox" aria-label="Leads">
      {leads.map((l) => (
        <li key={l.id}>
          <button
            role="option"
            aria-selected={l.id === selectedId}
            className={`lead-row${l.id === selectedId ? " is-selected" : ""}`}
            onClick={() => onSelect(l.id)}
          >
            <span className="lead-row-top">
              <span className="lead-name">{l.business_name}</span>
              <StatusChip status={l.status} />
            </span>
            <span className="lead-meta">
              {[l.category, l.area].filter(Boolean).join(", ")}
            </span>
            <span className="lead-sub">
              <span className={l.email ? "tag tag-ok" : "tag"}>{contactLabel(l)}</span>
              {l.rating != null && (
                <span className="muted">
                  {l.rating.toFixed(1)} stars, {l.reviews_count ?? 0} reviews
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
