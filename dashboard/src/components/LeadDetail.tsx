import { useEffect, useState } from "react";
import { OUTCOME_REASONS, STATUS_LABEL, type Lead, type LeadStatus } from "../types";
import { AlertIcon, BackIcon, ChatIcon, CopyIcon, MailIcon, RefreshIcon, SendIcon } from "./icons";
import StatusChip from "./StatusChip";

interface Props {
  lead: Lead;
  onPatch: (id: string, changes: Partial<Lead>) => void;
  onBack: () => void;
  notify: (message: string) => void;
}

type Tab = "email" | "whatsapp" | "followup";

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as LeadStatus[];

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function words(t: string): number {
  return t.trim() ? t.trim().split(/\s+/).length : 0;
}

const PITCH_LABEL: Record<string, string> = {
  website: "Website",
  internal_system: "Internal system",
  ui_fix: "UI fix",
  mixed: "Website and system",
};

function parseFlags(raw: string | null): string[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default function LeadDetail({ lead, onPatch, onBack, notify }: Props) {
  const emailOriginal = lead.email_draft ?? "";
  const waOriginal = lead.whatsapp_draft ?? "";
  const [body, setBody] = useState(lead.draft_edited ?? emailOriginal);
  const [wa, setWa] = useState(lead.whatsapp_edited ?? waOriginal);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [tab, setTab] = useState<Tab>(lead.email_draft || !lead.whatsapp_draft ? "email" : "whatsapp");

  // Pick up changes made elsewhere (for example "Use as email" in the chat panel).
  useEffect(() => setBody(lead.draft_edited ?? emailOriginal), [lead.draft_edited, emailOriginal]);
  useEffect(() => setWa(lead.whatsapp_edited ?? waOriginal), [lead.whatsapp_edited, waOriginal]);

  const emailEdited = body !== emailOriginal;
  const waEdited = wa !== waOriginal;
  const flags = parseFlags(lead.draft_flags);
  const waDigits = (lead.whatsapp_link ?? "").replace(/\D/g, "");
  const hasFollowUp = Boolean(lead.followup_draft);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label} copied`);
    } catch {
      notify("Copy failed. Select the text and copy it by hand.");
    }
  }

  function saveEmail() {
    const next = body === emailOriginal ? null : body;
    if (next !== (lead.draft_edited ?? null)) onPatch(lead.id, { draft_edited: next });
  }

  function saveWa() {
    const next = wa === waOriginal ? null : wa;
    if (next !== (lead.whatsapp_edited ?? null)) onPatch(lead.id, { whatsapp_edited: next });
  }

  function saveNotes() {
    const next = notes.trim() === "" ? null : notes;
    if (next !== (lead.notes ?? null)) onPatch(lead.id, { notes: next });
  }

  function markSent(channel: "sent" | "whatsapp") {
    onPatch(lead.id, { status: channel, sent_at: new Date().toISOString(), follow_up_at: inDays(5) });
    notify("Marked as sent. Follow-up set for 5 days");
  }

  function markFollowUpSent() {
    onPatch(lead.id, { status: lead.followup_channel === "whatsapp" ? "whatsapp" : "sent", follow_up_at: null });
    notify("Follow-up recorded. No more reminders for this lead");
  }

  const mailto = lead.email
    ? `mailto:${lead.email}?subject=${encodeURIComponent(lead.email_subject ?? "")}&body=${encodeURIComponent(body)}`
    : null;
  const waHref = (text: string) => (waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(text)}` : null);

  const emailWords = words(body);
  const waWords = words(wa);
  const web = lead.website
    ? lead.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
    : null;

  return (
    <>
      <article className="detail">
        <button className="back" onClick={onBack}>
          <BackIcon size={18} /> Leads
        </button>

        <header className="detail-head">
          <div>
            <h2>{lead.business_name}</h2>
            <p className="muted">{[lead.category, lead.area].filter(Boolean).join(" · ")}</p>
          </div>
          <StatusChip status={lead.status} />
        </header>

        <dl className="facts">
          <div className="fact">
            <dt>Google rating</dt>
            <dd>{lead.rating != null ? `${lead.rating.toFixed(1)} from ${lead.reviews_count ?? 0}` : "None"}</dd>
          </div>
          <div className="fact">
            <dt>Website</dt>
            <dd>
              {lead.website ? (
                <a href={lead.website} target="_blank" rel="noreferrer">
                  {web}
                </a>
              ) : (
                "None"
              )}
            </dd>
          </div>
          <div className="fact">
            <dt>Reach them</dt>
            <dd>{lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : "No phone"}</dd>
          </div>
          <div className="fact">
            <dt>Pitch</dt>
            <dd>{lead.pitch_type ? PITCH_LABEL[lead.pitch_type] ?? lead.pitch_type : "Not drafted yet"}</dd>
          </div>
        </dl>

        {(lead.detected_bottleneck || lead.observation_hook || lead.custom_fix) && (
          <dl className="why" aria-label="Why this lead">
            {lead.detected_bottleneck && (
              <div className="why-row">
                <dt>What's missing</dt>
                <dd>{lead.detected_bottleneck}</dd>
              </div>
            )}
            {lead.observation_hook && (
              <div className="why-row">
                <dt>What we noticed</dt>
                <dd>{lead.observation_hook}</dd>
              </div>
            )}
            {lead.custom_fix && (
              <div className="why-row">
                <dt>What we offer</dt>
                <dd>{lead.custom_fix}</dd>
              </div>
            )}
          </dl>
        )}

        {flags.length > 0 && (
          <section className="flags" aria-label="Check before sending">
            <p className="flags-title">
              <AlertIcon size={18} /> Check before sending
            </p>
            <ul>
              {flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="paper" aria-label="Drafts">
          <div className="paper-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "email"} className={`paper-tab${tab === "email" ? " is-active" : ""}`} onClick={() => setTab("email")}>
              <MailIcon size={16} /> Email {emailEdited && <span className="dot" title="Edited" />}
            </button>
            <button role="tab" aria-selected={tab === "whatsapp"} className={`paper-tab${tab === "whatsapp" ? " is-active" : ""}`} onClick={() => setTab("whatsapp")}>
              <ChatIcon size={16} /> WhatsApp {waEdited && <span className="dot" title="Edited" />}
            </button>
            {hasFollowUp && (
              <button role="tab" aria-selected={tab === "followup"} className={`paper-tab${tab === "followup" ? " is-active" : ""}`} onClick={() => setTab("followup")}>
                <RefreshIcon size={16} /> Follow-up
              </button>
            )}
            <span className="paper-spacer" />
            {lead.status === "new" && (
              <button className="btn btn-quiet btn-small" onClick={() => onPatch(lead.id, { status: "approved" })}>
                Approve
              </button>
            )}
            {lead.status !== "skipped" && (
              <button className="btn btn-quiet btn-small" onClick={() => onPatch(lead.id, { status: "skipped" })}>
                Skip
              </button>
            )}
            <button
              className="btn btn-quiet btn-small"
              disabled={Boolean(lead.redraft)}
              title="Writes new drafts within about 30 minutes and replaces your edits"
              onClick={() => {
                onPatch(lead.id, { redraft: true } as Partial<Lead>);
                notify("Queued. New drafts appear within about 30 minutes and replace your edits.");
              }}
            >
              <RefreshIcon size={14} /> {lead.redraft ? "Rewriting" : "Rewrite drafts"}
            </button>
          </div>

          {tab === "email" && (
            <div role="tabpanel">
              <div className="paper-row">
                <span className="paper-label">To</span>
                <span className="paper-value">{lead.email ?? <span className="muted">No email found. Use WhatsApp.</span>}</span>
                {lead.email && (
                  <button className="btn btn-quiet btn-small" onClick={() => copy(lead.email!, "Address")}>
                    <CopyIcon size={14} /> Copy
                  </button>
                )}
              </div>
              {(lead.all_emails?.length ?? 0) > 1 && (
                <div className="paper-row muted">
                  <span className="paper-label" />
                  <span className="paper-value">Also found: {lead.all_emails!.filter((e) => e !== lead.email).join(", ")}</span>
                </div>
              )}
              <div className="paper-row">
                <span className="paper-label">Subject</span>
                <span className="paper-value">{lead.email_subject ?? ""}</span>
                <button className="btn btn-quiet btn-small" onClick={() => copy(lead.email_subject ?? "", "Subject")} disabled={!lead.email_subject}>
                  <CopyIcon size={14} /> Copy
                </button>
              </div>
              {lead.email_draft || body ? (
                <>
                  <label className="sr-only" htmlFor="draft-body">
                    Email body
                  </label>
                  <textarea id="draft-body" className="letter" value={body} onChange={(e) => setBody(e.target.value)} onBlur={saveEmail} />
                  <div className="paper-foot">
                    <span className={emailWords < 85 || emailWords > 135 ? "warn" : ""}>{emailWords} words</span>
                    <span>Aim for 90 to 130</span>
                    <span className="paper-spacer" />
                    {emailEdited && (
                      <button
                        className="btn btn-quiet btn-small"
                        onClick={() => {
                          setBody(emailOriginal);
                          onPatch(lead.id, { draft_edited: null });
                        }}
                      >
                        Restore original
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="paper-empty">No email draft. Use the WhatsApp tab, or ask for a new draft below.</p>
              )}
            </div>
          )}

          {tab === "whatsapp" && (
            <div role="tabpanel">
              {lead.whatsapp_draft !== null || wa ? (
                <>
                  <label className="sr-only" htmlFor="wa-body">
                    WhatsApp text
                  </label>
                  <textarea id="wa-body" className="letter is-short" value={wa} onChange={(e) => setWa(e.target.value)} onBlur={saveWa} />
                  <div className="paper-foot">
                    <span className={waWords < 30 || waWords > 65 ? "warn" : ""}>{waWords} words</span>
                    <span>Aim for 35 to 60</span>
                    <span className="paper-spacer" />
                    {waEdited && (
                      <button
                        className="btn btn-quiet btn-small"
                        onClick={() => {
                          setWa(waOriginal);
                          onPatch(lead.id, { whatsapp_edited: null });
                        }}
                      >
                        Restore original
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="paper-empty">No WhatsApp text yet.</p>
              )}
            </div>
          )}

          {tab === "followup" && hasFollowUp && (
            <div role="tabpanel">
              <p className="paper-row muted">One follow-up by {lead.followup_channel ?? "message"}. After this, no more reminders.</p>
              <p className="pad-text">{lead.followup_draft}</p>
            </div>
          )}
        </section>

        <section className="tracking" aria-label="Tracking">
          <label>
            Status
            <select value={lead.status} onChange={(e) => onPatch(lead.id, { status: e.target.value as LeadStatus })}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Follow up on
            <input type="date" value={lead.follow_up_at ?? ""} onChange={(e) => onPatch(lead.id, { follow_up_at: e.target.value || null })} />
          </label>
          {(lead.status === "lost" || lead.status === "skipped") && (
            <label>
              Why
              <select value={lead.outcome_reason ?? ""} onChange={(e) => onPatch(lead.id, { outcome_reason: e.target.value || null })}>
                <option value="">Not recorded</option>
                {OUTCOME_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="tracking-notes">
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} rows={3} placeholder="Who you spoke to, what they said" />
          </label>
          {lead.sent_at && (
            <p className="muted tracking-foot">
              Sent {new Date(lead.sent_at).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </section>
        <div className="detail-end" />
      </article>

      <div className="action-bar">
        <div className="action-inner">
          {tab === "email" && (
            <>
              <button className="btn btn-primary" onClick={() => copy(body, "Email")} disabled={!body}>
                <CopyIcon size={16} /> Copy email
              </button>
              {mailto && (
                <a className="btn" href={mailto}>
                  <MailIcon size={16} /> Open in mail app
                </a>
              )}
              <button className="btn" onClick={() => markSent("sent")} disabled={lead.status === "sent"}>
                <SendIcon size={16} /> Mark sent
              </button>
            </>
          )}
          {tab === "whatsapp" && (
            <>
              <button className="btn btn-primary" onClick={() => copy(wa, "WhatsApp text")} disabled={!wa}>
                <CopyIcon size={16} /> Copy text
              </button>
              {waHref(wa) && (
                <a className="btn" href={waHref(wa)!} target="_blank" rel="noreferrer">
                  <ChatIcon size={16} /> Open in WhatsApp
                </a>
              )}
              <button className="btn" onClick={() => markSent("whatsapp")} disabled={lead.status === "whatsapp"}>
                <SendIcon size={16} /> Mark WhatsApp sent
              </button>
            </>
          )}
          {tab === "followup" && (
            <>
              <button className="btn btn-primary" onClick={() => copy(lead.followup_draft ?? "", "Follow-up")}>
                <CopyIcon size={16} /> Copy follow-up
              </button>
              {lead.followup_channel === "whatsapp" && waHref(lead.followup_draft ?? "") && (
                <a className="btn" href={waHref(lead.followup_draft ?? "")!} target="_blank" rel="noreferrer">
                  <ChatIcon size={16} /> Open in WhatsApp
                </a>
              )}
              <button className="btn" onClick={markFollowUpSent}>
                <SendIcon size={16} /> Mark follow-up sent
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
