import type { Lead } from "../types";
import { ChatIcon, Lattice, MailIcon } from "./icons";
import StatusChip from "./StatusChip";

interface Props {
  leads: Lead[];
  selectedId: string | null;
  showStatus: boolean;
  onSelect: (id: string) => void;
}

export default function LeadList({ leads, selectedId, showStatus, onSelect }: Props) {
  if (leads.length === 0) {
    return (
      <div className="empty">
        <Lattice size={54} />
        <strong>Nothing here</strong>
        <p>Clear a filter, or pick another stage. New leads arrive with the Monday run.</p>
      </div>
    );
  }

  return (
    <ul role="listbox" aria-label="Leads">
      {leads.map((l) => {
        const hasDraft = Boolean(l.email_draft || l.whatsapp_draft);
        return (
          <li key={l.id}>
            <button
              role="option"
              aria-selected={l.id === selectedId}
              data-status={l.status}
              className={`lead-row${l.id === selectedId ? " is-selected" : ""}`}
              onClick={() => onSelect(l.id)}
            >
              <span className="lead-name">{l.business_name}</span>
              {showStatus ? (
                <StatusChip status={l.status} />
              ) : (
                l.rating != null && (
                  <span className="muted">
                    {l.rating.toFixed(1)} <small>({l.reviews_count ?? 0})</small>
                  </span>
                )
              )}
              <span className="lead-meta">{[l.category, l.area].filter(Boolean).join(" · ")}</span>
              <span className="lead-flags">
                <span className={`lead-flag${l.email ? " is-on" : ""}`} title={l.email ? "Has email" : "No email"}>
                  <MailIcon size={14} />
                  {l.email ? "Email" : "No email"}
                </span>
                <span className={`lead-flag${l.phone ? " is-on" : ""}`} title={l.phone ? "Has a phone number" : "No phone"}>
                  <ChatIcon size={14} />
                  {l.phone ? "Phone" : "No phone"}
                </span>
                {l.status === "new" && !hasDraft && <span className="lead-flag is-attn">No draft yet</span>}
                {l.draft_flags && <span className="lead-flag is-attn">Check</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
