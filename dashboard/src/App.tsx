import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchLeads, updateLead } from "./api";
import { GROUPS, type Lead } from "./types";
import LeadList from "./components/LeadList";
import LeadDetail from "./components/LeadDetail";

export default function Desk() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<string>("review");
  const [onlyEmail, setOnlyEmail] = useState(false);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    fetchLeads()
      .then(setLeads)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const patch = useCallback(
    async (id: string, changes: Partial<Lead>) => {
      let previous: Lead | undefined;
      setLeads((all) =>
        all.map((l) => {
          if (l.id !== id) return l;
          previous = l;
          return { ...l, ...changes };
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
    for (const g of GROUPS) {
      out[g.key] = leads.filter((l) => g.statuses.includes(l.status)).length;
    }
    return out;
  }, [leads]);

  const categories = useMemo(
    () => Array.from(new Set(leads.map((l) => l.category).filter(Boolean) as string[])).sort(),
    [leads],
  );

  const visible = useMemo(() => {
    const g = GROUPS.find((x) => x.key === group);
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (g && !g.statuses.includes(l.status)) return false;
      if (onlyEmail && !l.email) return false;
      if (category && l.category !== category) return false;
      if (q && !`${l.business_name} ${l.area ?? ""} ${l.category ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [leads, group, onlyEmail, category, query]);

  const selected = visible.find((l) => l.id === selectedId) ?? null;

  // Keep a lead selected on desktop so the composer is never empty.
  useEffect(() => {
    if (!selected && visible.length > 0) setSelectedId(visible[0].id);
    if (visible.length === 0) setSelectedId(null);
  }, [visible, selected]);

  // Keyboard: j/k move, c copies the email, s marks sent, x skips.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
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
  }, [visible, selectedId, selected, patch, notify]);

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Lead Desk</h1>
        <p className="muted kbd-hint">j / k move, c copy, s sent, x skip</p>
        <a className="btn btn-quiet" href="/cdn-cgi/access/logout">
          Sign out
        </a>
      </header>

      <nav className="tabs" aria-label="Lead stage">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            className={`tab${g.key === group ? " is-active" : ""}`}
            onClick={() => setGroup(g.key)}
          >
            {g.label}
            <span className="tab-count">{counts[g.key] ?? 0}</span>
          </button>
        ))}
        <button className={`tab${group === "all" ? " is-active" : ""}`} onClick={() => setGroup("all")}>
          All
          <span className="tab-count">{leads.length}</span>
        </button>
      </nav>

      <div className={`layout${showDetail ? " show-detail" : ""}`}>
        <aside className="pane pane-list">
          <div className="filters">
            <input
              type="search"
              placeholder="Search name, area, category"
              aria-label="Search leads"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label className="check">
              <input type="checkbox" checked={onlyEmail} onChange={(e) => setOnlyEmail(e.target.checked)} />
              Has email
            </label>
          </div>

          {loading ? (
            <p className="muted pad">Loading leads</p>
          ) : error ? (
            <p className="notice notice-error pad" role="alert">
              {error}
            </p>
          ) : (
            <LeadList
              leads={visible}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setShowDetail(true);
              }}
            />
          )}
        </aside>

        <main className="pane pane-detail">
          {selected ? (
            <LeadDetail
              key={selected.id}
              lead={selected}
              onPatch={patch}
              onBack={() => setShowDetail(false)}
              notify={notify}
            />
          ) : (
            <div className="empty">
              <p>Nothing selected.</p>
              <p className="muted">Pick a lead from the list to review its draft.</p>
            </div>
          )}
        </main>
      </div>

      <div className={`toast${toast ? " is-on" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
