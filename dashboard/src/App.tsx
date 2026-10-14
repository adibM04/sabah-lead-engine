import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchLeads, fetchPlaybook, fetchQueries, updateLead } from "./api";
import { GROUPS, type Lead, type LeadChanges } from "./types";
import LeadList from "./components/LeadList";
import LeadDetail from "./components/LeadDetail";
import Insights from "./components/Insights";
import Settings from "./components/Settings";
import Chat from "./components/Chat";
import Scans from "./components/Scans";
import { leadScore } from "./score";
import { Lattice, MoonIcon, SparkIcon, SunIcon } from "./components/icons";

type Theme = "light" | "dark" | "auto";

function readTheme(): Theme {
  try {
    const v = localStorage.getItem("lead-desk-theme");
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export default function Desk() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<string>("review");
  const [onlyEmail, setOnlyEmail] = useState(false);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"best" | "newest">("best");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [pending, setPending] = useState(0);
  const [chatOpen, setChatOpen] = useState(() => window.innerWidth >= 1280);
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      if (theme === "auto") localStorage.removeItem("lead-desk-theme");
      else localStorage.setItem("lead-desk-theme", theme);
    } catch {
      // private mode: the theme still applies for this visit
    }
  }, [theme]);

  const isDark = theme === "dark" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const refreshPending = useCallback(() => {
    Promise.all([fetchPlaybook(), fetchQueries()])
      .then(([p, q]) => setPending((p.proposed ? 1 : 0) + q.filter((x) => x.status === "suggested").length))
      .catch(() => setPending(0));
  }, []);
  useEffect(refreshPending, [refreshPending]);

  useEffect(() => {
    fetchLeads()
      .then(setLeads)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const patch = useCallback(
    async (id: string, changes: LeadChanges) => {
      let previous: Lead | undefined;
      setLeads((all) =>
        all.map((l) => {
          if (l.id !== id) return l;
          previous = l;
          return { ...l, ...changes } as Lead;
        }),
      );
      try {
        await updateLead(id, changes);
      } catch (e) {
        notify(`Could not save: ${(e as Error).message}`);
        if (previous) setLeads((all) => all.map((l) => (l.id === id ? previous! : l)));
      }
    },
    [notify],
  );

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const g of GROUPS) out[g.key] = leads.filter((l) => g.statuses.includes(l.status)).length;
    return out;
  }, [leads]);

  const categories = useMemo(
    () => Array.from(new Set(leads.map((l) => l.category).filter(Boolean) as string[])).sort(),
    [leads],
  );

  const onLeadView = group !== "insights" && group !== "settings" && group !== "scans";

  const visible = useMemo(() => {
    const g = GROUPS.find((x) => x.key === group);
    const q = query.trim().toLowerCase();
    const list = leads.filter((l) => {
      if (g && !g.statuses.includes(l.status)) return false;
      if (onlyEmail && !l.email) return false;
      if (category && l.category !== category) return false;
      if (q && !`${l.business_name} ${l.area ?? ""} ${l.category ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === "best") list.sort((a, b) => leadScore(b) - leadScore(a) || b.created_at.localeCompare(a.created_at));
    return list;
  }, [leads, group, onlyEmail, category, query, sort]);

  const selected = visible.find((l) => l.id === selectedId) ?? null;

  // Keep a lead selected on desktop so the editor is never empty.
  useEffect(() => {
    if (!selected && visible.length > 0) setSelectedId(visible[0].id);
    if (visible.length === 0) setSelectedId(null);
  }, [visible, selected]);

  // Keyboard: j/k move, c copies the email, s marks sent, x skips.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey || !onLeadView) return;
      const idx = visible.findIndex((l) => l.id === selectedId);
      if (e.key === "j" && idx < visible.length - 1) setSelectedId(visible[idx + 1].id);
      if (e.key === "k" && idx > 0) setSelectedId(visible[idx - 1].id);
      if (!selected) return;
      if (e.key === "c") {
        const text = selected.draft_edited ?? selected.email_draft ?? "";
        navigator.clipboard.writeText(text).then(() => notify("Email copied"));
      }
      if (e.key === "s") {
        patch(selected.id, {
          status: "sent",
          sent_at: new Date().toISOString(),
          follow_up_at: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10),
        });
        notify("Marked as sent");
      }
      if (e.key === "x") patch(selected.id, { status: "skipped" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedId, selected, patch, notify, onLeadView]);

  function applyFromChat(field: "email" | "whatsapp", text: string) {
    if (!selected) return;
    patch(selected.id, field === "email" ? { draft_edited: text } : { whatsapp_edited: text });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Lattice />
          <span className="brand-name">Lead Desk</span>
        </div>

        <nav className="stages" aria-label="Lead stage">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              className={`stage${group === g.key ? " is-active" : ""}`}
              onClick={() => {
                setGroup(g.key);
                setShowDetail(false);
              }}
            >
              {g.label}
              <span className="stage-count">{counts[g.key] ?? 0}</span>
            </button>
          ))}
          <button className={`stage${group === "all" ? " is-active" : ""}`} onClick={() => { setGroup("all"); setShowDetail(false); }}>
            All
            <span className="stage-count">{leads.length}</span>
          </button>
        </nav>

        <div className="topbar-right">
          <button className={`stage${group === "scans" ? " is-active" : ""}`} onClick={() => setGroup("scans")}>
            Scans
          </button>
          <button className={`stage${group === "insights" ? " is-active" : ""}`} onClick={() => setGroup("insights")}>
            Insights
            {pending > 0 && <span className="stage-count is-attn">{pending}</span>}
          </button>
          <button className={`stage${group === "settings" ? " is-active" : ""}`} onClick={() => setGroup("settings")}>
            Settings
          </button>
          <button
            className="icon-btn"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            title={isDark ? "Light theme" : "Dark theme"}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            className={`icon-btn${chatOpen ? " is-on" : ""}`}
            onClick={() => setChatOpen((o) => !o)}
            aria-label={chatOpen ? "Hide chat" : "Ask DeepSeek"}
            aria-pressed={chatOpen}
            title="Ask DeepSeek"
          >
            <SparkIcon />
          </button>
        </div>
      </header>

      <div className="body">
        <div className="main">
          {group === "insights" && (
            <main className="page">
              <div className="page-inner">
                <Insights notify={notify} onChanged={refreshPending} />
              </div>
            </main>
          )}
          {group === "scans" && (
            <main className="page">
              <div className="page-inner">
                <Scans notify={notify} />
              </div>
            </main>
          )}
          {group === "settings" && (
            <main className="page">
              <div className="page-inner">
                <Settings notify={notify} />
              </div>
            </main>
          )}

          {onLeadView && (
            <div className={`workspace${showDetail ? " show-detail" : ""}`}>
              <aside className="pane pane-list">
                <div className="filters">
                  <input
                    type="search"
                    placeholder="Search name, area or category"
                    aria-label="Search leads"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <div className="filters-row">
                    <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
                      <option value="">All categories</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <select value={sort} onChange={(e) => setSort(e.target.value as "best" | "newest")} aria-label="Sort leads">
                      <option value="best">Best first</option>
                      <option value="newest">Newest first</option>
                    </select>
                    <label className="check">
                      <input type="checkbox" checked={onlyEmail} onChange={(e) => setOnlyEmail(e.target.checked)} />
                      Has email
                    </label>
                  </div>
                </div>

                <div className="list-scroll">
                  {loading ? (
                    <>
                      <div className="skeleton" />
                      <div className="skeleton" />
                      <div className="skeleton" />
                    </>
                  ) : error ? (
                    <p className="notice notice-error pad" role="alert">
                      {error}
                    </p>
                  ) : (
                    <LeadList
                      leads={visible}
                      selectedId={selectedId}
                      showStatus={group === "all"}
                      onSelect={(id) => {
                        setSelectedId(id);
                        setShowDetail(true);
                      }}
                    />
                  )}
                </div>
                <p className="kbd-hint">
                  <kbd>j</kbd> <kbd>k</kbd> move, <kbd>c</kbd> copy, <kbd>s</kbd> sent, <kbd>x</kbd> skip
                </p>
              </aside>

              <main className="pane pane-detail">
                {selected ? (
                  <LeadDetail key={selected.id} lead={selected} onPatch={patch} onBack={() => setShowDetail(false)} notify={notify} />
                ) : (
                  <div className="empty">
                    <Lattice size={54} />
                    <strong>No lead selected</strong>
                    <p>Pick one from the list to read its draft.</p>
                  </div>
                )}
              </main>
            </div>
          )}
        </div>

        {chatOpen && (
          <Chat lead={onLeadView ? selected : null} onClose={() => setChatOpen(false)} onApply={applyFromChat} notify={notify} />
        )}
      </div>

      <div className={`toast${toast ? " is-on" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
