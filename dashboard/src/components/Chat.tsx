import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { streamChat, type ChatMessage } from "../api";
import type { Lead } from "../types";
import { CloseIcon, CopyIcon, SendIcon, SparkIcon, StopIcon } from "./icons";

export interface Msg extends ChatMessage {
  error?: boolean;
}

export type ChatThreads = Record<string, Msg[]>;

interface Props {
  lead: Lead | null;
  onClose: () => void;
  onApply: (field: "email" | "whatsapp", text: string) => void;
  notify: (m: string) => void;
  prefill?: string | null;
  onPrefillUsed?: () => void;
  threads: ChatThreads;
  setThreads: Dispatch<SetStateAction<ChatThreads>>;
}

interface Prompt {
  label: string;
  text: string;
  prefill?: string;
}

const LEAD_PROMPTS: Prompt[] = [
  { label: "Tighten the email", text: "Tighten the email to about 100 words. Keep the same opening and the same ask." },
  { label: "Warmer WhatsApp", text: "Rewrite the WhatsApp text so it sounds warmer and more local. 35 to 60 words." },
  { label: "Subject lines", text: "Give me three subject line options for the email, one per line." },
  { label: "Why this pitch?", text: "Why is this the right pitch for this business? Two or three sentences, and say what could be wrong with it." },
  { label: "Reply to their answer", text: "", prefill: "They replied: " },
];

const GENERAL_PROMPTS: Prompt[] = [
  { label: "Types of business to approach next", text: "Suggest five kinds of Sabah business that would likely need a booking or job-tracking system, and why." },
  { label: "Polite reply to a no", text: "Write a short, polite reply to someone who says they are not interested. No pushing." },
  { label: "Intro after meeting in person", text: "Write a short message to send after meeting a business owner in person and offering to show them a mock-up." },
];

export default function Chat({ lead, onClose, onApply, notify, prefill, onPrefillUsed, threads, setThreads }: Props) {
  const key = lead?.id ?? "general";
  const [input, setInput] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [shareLead, setShareLead] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  const msgs = threads[key] ?? [];
  const busy = busyKey !== null;
  const sharing = Boolean(lead) && shareLead;

  useEffect(() => setShareLead(true), [lead?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs, key]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!prefill) return;
    setInput(prefill);
    inputRef.current?.focus();
    onPrefillUsed?.();
  }, [prefill, onPrefillUsed]);

  function update(k: string, fn: (m: Msg[]) => Msg[]) {
    setThreads((t) => ({ ...t, [k]: fn(t[k] ?? []) }));
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const k = key;
    const leadId = sharing ? lead!.id : null;
    const history: ChatMessage[] = [...(threads[k] ?? []).filter((m) => !m.error && m.content), { role: "user", content }];

    update(k, (m) => [...m, { role: "user", content }, { role: "assistant", content: "" }]);
    setInput("");
    stick.current = true;
    setBusyKey(k);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await streamChat(
        history,
        leadId,
        (piece) =>
          update(k, (m) => {
            const next = m.slice();
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, content: last.content + piece };
            return next;
          }),
        ctrl.signal,
      );
      update(k, (m) => {
        const last = m[m.length - 1];
        return last && !last.content ? [...m.slice(0, -1), { role: "assistant", content: "The model sent nothing back. Try again.", error: true }] : m;
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        update(k, (m) => [...m.slice(0, -1), { role: "assistant", content: (e as Error).message, error: true }]);
      } else {
        update(k, (m) => (m[m.length - 1]?.content ? m : m.slice(0, -1)));
      }
    } finally {
      setBusyKey(null);
      abortRef.current = null;
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify("Copied");
    } catch {
      notify("Copy failed. Select the text and copy it by hand.");
    }
  }

  const prompts = lead ? LEAD_PROMPTS : GENERAL_PROMPTS;

  return (
    <aside className="chat" aria-label="Chat with DeepSeek">
      <div className="chat-head">
        <h2 className="chat-title">
          <SparkIcon size={18} /> Ask DeepSeek
          <button className="icon-btn" onClick={onClose} aria-label="Close chat">
            <CloseIcon size={18} />
          </button>
        </h2>
        {lead ? (
          sharing ? (
            <span className="ctx" title="DeepSeek can see this lead's details and drafts, plus the active playbook">
              <span>Sees {lead.business_name} and the playbook</span>
              <button onClick={() => setShareLead(false)} aria-label="Stop sharing this lead">
                <CloseIcon size={12} />
              </button>
            </span>
          ) : (
            <button className="ctx is-off" onClick={() => setShareLead(true)}>
              Not sharing {lead.business_name}. Share again
            </button>
          )
        ) : (
          <span className="ctx is-off">Sees the playbook only. Pick a lead to share it.</span>
        )}
      </div>

      <div
        className="chat-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        {msgs.length === 0 && (
          <div className="chat-intro">
            <p>
              {lead
                ? "Ask for a rewrite, a second opinion, or a reply to whatever they said. Replies can go straight into the email or WhatsApp editor."
                : "Ask anything about outreach. Select a lead to talk about its drafts."}
            </p>
            <div className="quick">
              {prompts.map((p) => (
                <button
                  key={p.label}
                  disabled={busy}
                  onClick={() => {
                    if (p.prefill) {
                      setInput(p.prefill);
                      inputRef.current?.focus();
                    } else void send(p.text);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => {
          const streaming = busy && busyKey === key && i === msgs.length - 1 && m.role === "assistant";
          return (
            <div key={i} className={`msg ${m.role === "user" ? "msg-user" : "msg-ai"}`}>
              <div className={`bubble${m.error ? " is-error" : ""}`}>
                {m.content || (streaming ? <span className="typing" aria-label="Writing"><i /><i /><i /></span> : null)}
              </div>
              {m.role === "assistant" && !m.error && m.content && !streaming && (
                <div className="msg-actions">
                  <button className="btn btn-quiet btn-small" onClick={() => copy(m.content)}>
                    <CopyIcon size={14} /> Copy
                  </button>
                  {lead && sharing && (
                    <>
                      <button className="btn btn-quiet btn-small" onClick={() => { onApply("email", m.content); notify("Put in the email editor"); }}>
                        Use as email
                      </button>
                      <button className="btn btn-quiet btn-small" onClick={() => { onApply("whatsapp", m.content); notify("Put in the WhatsApp editor"); }}>
                        Use as WhatsApp
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {msgs.length > 0 && (
          <div className="quick">
            {prompts.slice(0, 3).map((p) => (
              <button key={p.label} disabled={busy || Boolean(p.prefill)} onClick={() => void send(p.text)}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="chat-compose">
        <div className="chat-box">
          <label className="sr-only" htmlFor="chat-input">
            Message DeepSeek
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            rows={1}
            value={input}
            placeholder={lead ? `Ask about ${lead.business_name}` : "Ask about outreach"}
            maxLength={4000}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={onKeyDown}
          />
          {busy ? (
            <button className="send" onClick={() => abortRef.current?.abort()} aria-label="Stop writing">
              <StopIcon size={18} />
            </button>
          ) : (
            <button className="send" onClick={() => void send(input)} disabled={!input.trim()} aria-label="Send">
              <SendIcon size={18} />
            </button>
          )}
        </div>
        <p className="chat-hint">Enter to send, Shift+Enter for a new line. It can't send anything for you.</p>
      </div>
    </aside>
  );
}
