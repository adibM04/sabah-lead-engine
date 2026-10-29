import { useEffect, useState } from "react";
import { analyseReply, fetchWebsiteReport } from "../api";
import { leadScore, scoreSummary } from "../score";
import { OUTCOME_REASONS, STATUS_LABEL, type Lead, type LeadChanges, type LeadStatus, type ReplyAnalysis } from "../types";
import { AlertIcon, BackIcon, ChatIcon, CopyIcon, MailIcon, RefreshIcon, SendIcon, SparkIcon } from "./icons";
import StatusChip from "./StatusChip";
import { PITCH_LABEL } from "./pitch";

interface Props {
  lead: Lead;
  onPatch: (id: string, changes: LeadChanges) => void;
  onBack: () => void;
  notify: (message: string) => void;
  onAskChat: (text: string) => void;
}

type Tab = "email" | "whatsapp" | "followup" | "mockup" | "report";

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as LeadStatus[];

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function words(t: string): number {
  return t.trim() ? t.trim().split(/\s+/).length : 0;
}


function parseFlags(raw: string | null): string[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default function LeadDetail({ lead, onPatch, onBack, notify, onAskChat }: Props) {
  const emailOriginal = lead.email_draft ?? "";
  const waOriginal = lead.whatsapp_draft ?? "";
  const [body, setBody] = useState(lead.draft_edited ?? emailOriginal);
  const [wa, setWa] = useState(lead.whatsapp_edited ?? waOriginal);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [reply, setReply] = useState("");
  const [analysis, setAnalysis] = useState<ReplyAnalysis | null>(null);
  const [reading, setReading] = useState(false);
  const [tab, setTab] = useState<Tab>(lead.email_draft || !lead.whatsapp_draft ? "email" : "whatsapp");
  const [report, setReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  async function readWebsite() {
    setReportLoading(true);
    try {
      setReport((await fetchWebsiteReport(lead.id)).report);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setReportLoading(false);
    }
  }

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

  async function readReply() {
    setReading(true);
    setAnalysis(null);
    try {
      setAnalysis(await analyseReply(lead.id, reply));
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setReading(false);
    }
  }

  function applyAnalysis(a: ReplyAnalysis) {
    const day = new Date().toLocaleDateString("en-MY", { day: "numeric", month: "short" });
    const nextNotes = `${notes.trim() ? `${notes.trim()}\n\n` : ""}Reply ${day}: ${reply.trim()}`;
    setNotes(nextNotes);
    onPatch(lead.id, {
      status: a.suggested_status,
      notes: nextNotes,
      outcome_reason: a.suggested_status === "lost" ? a.outcome_reason : lead.outcome_reason,
      follow_up_at: a.suggested_status === "follow_up" ? inDays(5) : lead.follow_up_at,
    });
    setReply("");
    setAnalysis(null);
    notify(`Moved to ${STATUS_LABEL[a.suggested_status]} and saved their reply in the notes`);
  }

  const canMockup = Boolean(lead.website);
  const mockupWaiting = lead.mockup_status === "requested";

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
        <p className="score-line">
          <span className="score score-lg" aria-label={`Score ${leadScore(lead)} of 85`}>
            {leadScore(lead)}
          </span>
          <span className="muted">of 85. {scoreSummary(lead)}</span>
        </p>

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
            {canMockup && (
              <button role="tab" aria-selected={tab === "mockup"} className={`paper-tab${tab === "mockup" ? " is-active" : ""}`} onClick={() => setTab("mockup")}>
                <SparkIcon size={16} /> Mock-up {lead.has_mockup && lead.mockup_status === "ready" && <span className="dot" title="Ready" />}
              </button>
            )}
            {canMockup && (
              <button role="tab" aria-selected={tab === "report"} className={`paper-tab${tab === "report" ? " is-active" : ""}`} onClick={() => setTab("report")}>
                <SparkIcon size={16} /> Website report {report && <span className="dot" title="Ready" />}
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
                onPatch(lead.id, { redraft: true });
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

          {tab === "mockup" && canMockup && (
            <div role="tabpanel" className="mockup-panel">
              {lead.has_mockup && lead.mockup_status !== "requested" ? (
                <>
                  <p className="paper-row muted">
                    A rough concept built from their current website, to show in person or attach. Anything not on their site is a placeholder.
                  </p>
                  <iframe
                    key={lead.mockup_at ?? "m"}
                    className="mockup-frame"
                    title={`Concept mock-up for ${lead.business_name}`}
                    src={`/api/mockup/${encodeURIComponent(lead.id)}`}
                    sandbox=""
                  />
                </>
              ) : mockupWaiting ? (
                <p className="paper-empty">Queued. The mock-up appears within about 30 minutes. This page checks again when you reopen the lead.</p>
              ) : lead.mockup_status === "failed" ? (
                <p className="paper-empty">The last attempt failed, usually because the site could not be read. You can try again.</p>
              ) : (
                <p className="paper-empty">
                  No mock-up yet. DeepSeek can build a one-page concept from their current website. It takes a few minutes and uses a little API credit.
                </p>
              )}
            </div>
          )}
          {tab === "report" && canMockup && (
            <div role="tabpanel" className="mockup-panel">
              {reportLoading ? (
                <p className="paper-empty">Reading their website and writing a report.</p>
              ) : report ? (
                <p className="pad-text">{report}</p>
              ) : (
                <p className="paper-empty">DeepSeek can read their current website and summarise what's there, what's missing, and what to propose.</p>
              )}
            </div>
          )}
        </section>

        {["sent", "whatsapp", "follow_up", "replied"].includes(lead.status) && (
          <section className="reply-box" aria-label="They replied">
            <h3>They replied?</h3>
            <p className="muted">Paste what they said. DeepSeek reads it and suggests the next step. Nothing changes until you click.</p>
            <label className="sr-only" htmlFor="reply-text">
              Their reply
            </label>
            <textarea id="reply-text" rows={4} value={reply} maxLength={4000} onChange={(e) => setReply(e.target.value)} placeholder="Paste their email or WhatsApp reply" />
            <div className="actions">
              <button className="btn btn-primary" disabled={reading || reply.trim().length < 2} onClick={readReply}>
                {reading ? "Reading" : "Read their reply"}
              </button>
            </div>
            {analysis && (
              <div className="analysis" aria-live="polite">
                <p>
                  <span className={`chip tone-${analysis.sentiment}`}>{analysis.sentiment}</span> {analysis.summary}
                </p>
                <p className="muted">
                  Suggested: move to <strong>{STATUS_LABEL[analysis.suggested_status]}</strong>
                  {analysis.outcome_reason ? ` (${analysis.outcome_reason})` : ""}.
                </p>
                {analysis.suggested_reply && (
                  <>
                    <label className="sr-only" htmlFor="reply-suggest">
                      Suggested reply
                    </label>
                    <textarea
                      id="reply-suggest"
                      className="letter is-short"
                      value={analysis.suggested_reply}
                      onChange={(e) => setAnalysis({ ...analysis, suggested_reply: e.target.value })}
                    />
                  </>
                )}
                <div className="actions">
                  <button className="btn btn-primary" onClick={() => applyAnalysis(analysis)}>
                    Move to {STATUS_LABEL[analysis.suggested_status]} and save reply
                  </button>
                  {analysis.suggested_reply && (
                    <button className="btn" onClick={() => copy(analysis.suggested_reply!, "Reply")}>
                      <CopyIcon size={16} /> Copy suggested reply
                    </button>
                  )}
                  {analysis.suggested_reply && waHref(analysis.suggested_reply) && (
                    <a className="btn" href={waHref(analysis.suggested_reply)!} target="_blank" rel="noreferrer">
                      <ChatIcon size={16} /> Open in WhatsApp
                    </a>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

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
          {tab === "mockup" && (
            <>
              {lead.has_mockup && lead.mockup_status !== "requested" && (
                <>
                  <a className="btn btn-primary" href={`/api/mockup/${encodeURIComponent(lead.id)}?download=1`}>
                    <CopyIcon size={16} /> Download HTML
                  </a>
                  <a className="btn" href={`/api/mockup/${encodeURIComponent(lead.id)}`} target="_blank" rel="noreferrer">
                    Open full page
                  </a>
                </>
              )}
              <button
                className={lead.has_mockup ? "btn" : "btn btn-primary"}
                disabled={mockupWaiting}
                onClick={() => {
                  onPatch(lead.id, { mockup: "request", mockup_status: "requested" });
                  notify("Queued. The mock-up appears within about 30 minutes.");
                }}
              >
                <RefreshIcon size={16} /> {mockupWaiting ? "Queued" : lead.has_mockup ? "Rebuild mock-up" : "Build a mock-up"}
              </button>
            </>
          )}
          {tab === "report" && (
            <>
              <button className={report ? "btn" : "btn btn-primary"} disabled={reportLoading} onClick={readWebsite}>
                <RefreshIcon size={16} /> {reportLoading ? "Reading" : report ? "Re-read website" : "Read their website"}
              </button>
              {report && (
                <>
                  <button className="btn" onClick={() => copy(report, "Report")}>
                    <CopyIcon size={16} /> Copy
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      onAskChat(
                        `Here's a report on ${lead.business_name}'s current website:\n\n${report}\n\nWrite a cold outreach email proposing the fix, grounded only in this and what you already know about them.`,
                      )
                    }
                  >
                    <MailIcon size={16} /> Draft email from this
                  </button>
                </>
              )}
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
