import { useState } from "react";
import { STATUS_LABEL, type Lead, type LeadStatus } from "../types";
import StatusChip from "./StatusChip";

interface Props {
  lead: Lead;
  onPatch: (id: string, changes: Partial<Lead>) => void;
  onBack: () => void;
  notify: (message: string) => void;
}

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as LeadStatus[];

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function LeadDetail({ lead, onPatch, onBack, notify }: Props) {
  const original = lead.email_draft ?? "";
  const [body, setBody] = useState(lead.draft_edited ?? original);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const edited = body !== original;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label} copied`);
    } catch {
      notify("Copy failed. Select the text and copy it manually.");
    }
  }

  function saveBody() {
    const next = body === original ? null : body;
    if (next !== (lead.draft_edited ?? null)) onPatch(lead.id, { draft_edited: next });
  }

  function saveNotes() {
    const next = notes.trim() === "" ? null : notes;
    if (next !== (lead.notes ?? null)) onPatch(lead.id, { notes: next });
  }

  function markSent() {
    onPatch(lead.id, { status: "sent", sent_at: new Date().toISOString(), follow_up_at: inDays(5) });
    notify("Marked as sent. Follow-up set for 5 days");
  }

  const mailto = lead.email
    ? `mailto:${lead.email}?subject=${encodeURIComponent(lead.email_subject ?? "")}&body=${encodeURIComponent(body)}`
    : null;

  return (
    <article className="detail">
      <button className="back" onClick={onBack}>
        Back to list
      </button>

      <header className="detail-head">
        <div>
          <h2>{lead.business_name}</h2>
          <p className="muted">
            {[lead.category, lead.area].filter(Boolean).join(", ")}
          </p>
        </div>
        <StatusChip status={lead.status} />
      </header>

      <nav className="links" aria-label="Business links">
        {lead.google_maps_url && (
          <a href={lead.google_maps_url} target="_blank" rel="noreferrer">
            Google Maps
          </a>
        )}
        {lead.website && (
          <a href={lead.website} target="_blank" rel="noreferrer">
            Website
          </a>
        )}
        {lead.phone && <a href={`tel:${lead.phone}`}>{lead.phone}</a>}
      </nav>

      <section className="signals" aria-label="What the audit found">
        <dl>
          <div>
            <dt>Bottleneck</dt>
            <dd>{lead.detected_bottleneck ?? "None detected"}</dd>
          </div>
          <div>
            <dt>What we noticed</dt>
            <dd>{lead.observation_hook ?? "Nothing recorded"}</dd>
          </div>
          <div>
            <dt>Proposed fix</dt>
            <dd>{lead.custom_fix ?? "Nothing recorded"}</dd>
          </div>
        </dl>
        <p className="signal-flags muted">
          {lead.website ? "Has a website" : "No website"}
          {lead.has_whatsapp_link ? ", WhatsApp link on site" : ", no WhatsApp link on site"}
          {lead.uses_linktree ? ", uses Linktree" : ""}
        </p>
      </section>

      <section className="composer" aria-label="Email draft">
        <div className="composer-bar">
          <span className="composer-title">Draft</span>
          {edited && <span className="tag">Edited</span>}
        </div>

        <div className="composer-row">
          <span className="composer-label">To</span>
          <span className="composer-value">
            {lead.email ?? <span className="muted">No email found. Use WhatsApp.</span>}
          </span>
          {lead.email && (
            <button className="btn btn-quiet" onClick={() => copy(lead.email!, "Address")}>
              Copy
            </button>
          )}
        </div>
        {(lead.all_emails?.length ?? 0) > 1 && (
          <div className="composer-row composer-row-note muted">
            Also found: {lead.all_emails!.filter((e) => e !== lead.email).join(", ")}
          </div>
        )}
        <div className="composer-row">
          <span className="composer-label">Subject</span>
          <span className="composer-value">{lead.email_subject ?? ""}</span>
          <button
            className="btn btn-quiet"
            onClick={() => copy(lead.email_subject ?? "", "Subject")}
            disabled={!lead.email_subject}
          >
            Copy
          </button>
        </div>

        <label className="sr-only" htmlFor="draft-body">
          Email body
        </label>
        <textarea
          id="draft-body"
          className="composer-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={saveBody}
          rows={11}
        />
        {edited && (
          <button className="btn btn-quiet restore" onClick={() => { setBody(original); onPatch(lead.id, { draft_edited: null }); }}>
            Restore original draft
          </button>
        )}
      </section>

      <div className="actions">
        <button className="btn btn-primary" onClick={() => copy(body, "Email")}>
          Copy email
        </button>
        {mailto && (
          <a className="btn" href={mailto}>
            Open in mail app
          </a>
        )}
        <button className="btn" onClick={markSent} disabled={lead.status === "sent"}>
          Mark sent
        </button>
        {lead.whatsapp_link && (
          <a className="btn" href={lead.whatsapp_link} target="_blank" rel="noreferrer">
            Open WhatsApp
          </a>
        )}
      </div>

      <div className="actions actions-secondary">
        {lead.status === "new" && (
          <button className="btn btn-quiet" onClick={() => onPatch(lead.id, { status: "approved" })}>
            Approve
          </button>
        )}
        {lead.status !== "whatsapp" && lead.phone && (
          <button
            className="btn btn-quiet"
            onClick={() => onPatch(lead.id, { status: "whatsapp", sent_at: new Date().toISOString(), follow_up_at: inDays(5) })}
          >
            Mark WhatsApp sent
          </button>
        )}
        {lead.status !== "skipped" && (
          <button className="btn btn-quiet" onClick={() => onPatch(lead.id, { status: "skipped" })}>
            Skip
          </button>
        )}
      </div>

      <section className="tracking" aria-label="Tracking">
        <label>
          Status
          <select
            value={lead.status}
            onChange={(e) => onPatch(lead.id, { status: e.target.value as LeadStatus })}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Follow up on
          <input
            type="date"
            value={lead.follow_up_at ?? ""}
            onChange={(e) => onPatch(lead.id, { follow_up_at: e.target.value || null })}
          />
        </label>
        <label className="tracking-notes">
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            rows={3}
            placeholder="Who you spoke to, what they said"
          />
        </label>
        {lead.sent_at && (
          <p className="muted">Sent {new Date(lead.sent_at).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}</p>
        )}
      </section>
    </article>
  );
}
