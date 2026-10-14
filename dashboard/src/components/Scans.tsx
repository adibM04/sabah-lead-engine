import { useCallback, useEffect, useRef, useState } from "react";
import { fetchScans, requestScan } from "../api";
import type { ScanRequest, ScanRun, ScansState } from "../types";

const COUNTS = [5, 10, 20, 30];
const STALLED_MS = 10 * 60_000;

const stamp = (iso: string) => new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

function duration(run: ScanRun): string {
  if (!run.finished_at) return "";
  const s = Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000);
  return s < 90 ? `${s}s` : `${Math.round(s / 60)} min`;
}

const REQUEST_LABEL: Record<ScanRequest["status"], string> = {
  pending: "Waiting for the pipeline",
  running: "Running now",
  done: "Done",
  failed: "Failed",
};

export default function Scans({ notify }: { notify: (m: string) => void }) {
  const [state, setState] = useState<ScansState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [count, setCount] = useState(10);
  const [sending, setSending] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setState(await fetchScans());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const busy = Boolean(state?.runs.some((r) => r.status === "running") || state?.requests.some((r) => r.status === "pending" || r.status === "running"));

  const busyRef = useRef(busy);
  busyRef.current = busy;

  // Poll quickly while something is running, slowly otherwise.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      await load();
      if (alive) timer.current = window.setTimeout(tick, busyRef.current ? 4000 : 30000);
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer.current);
    };
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      await requestScan(query.trim(), count);
      setQuery("");
      notify("Scan queued. It starts within about 2 minutes.");
      await load();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (error && !state) return <p className="notice notice-error pad" role="alert">{error}</p>;
  if (!state) return <p className="muted pad">Loading</p>;

  const active = state.runs.find((r) => r.status === "running");
  const stalled = active && (!active.heartbeat_at || Date.now() - new Date(active.heartbeat_at).getTime() > STALLED_MS);
  const open = state.requests.filter((r) => r.status === "pending" || r.status === "running");
  const lastDone = state.runs.find((r) => r.status !== "running");

  return (
    <div className="insights">
      <section className="card">
        <h2>Scan now</h2>
        <p className="muted">
          Search Google Maps for a kind of business. New ones get audited and drafted like the Monday run. Already known businesses are skipped.
        </p>
        <form className="scan-form" onSubmit={submit}>
          <label className="sr-only" htmlFor="scan-q">
            What to search for
          </label>
          <input
            id="scan-q"
            type="text"
            placeholder="dental clinic in Kota Kinabalu"
            value={query}
            maxLength={120}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="sr-only" htmlFor="scan-n">
            How many businesses
          </label>
          <select id="scan-n" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {COUNTS.map((n) => (
              <option key={n} value={n}>
                Up to {n}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" type="submit" disabled={sending || query.trim().length < 3 || open.length >= 5}>
            Scan now
          </button>
        </form>
        {open.length >= 5 && <p className="notice notice-attn">Five scans are waiting. Let them finish before adding more.</p>}
        {open.length > 0 && (
          <ul className="scan-queue" aria-label="Queued scans">
            {open.map((r) => (
              <li key={r.id}>
                <strong>{r.query}</strong>
                <span className="muted">
                  up to {r.max_results}, {REQUEST_LABEL[r.status].toLowerCase()}, asked {ago(r.requested_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-live="polite">
        <h2>{active ? "Scanning now" : "Latest scan"}</h2>
        {active ? (
          <>
            <p>
              <strong>{active.queries.join("; ") || "Search"}</strong>
              <span className="muted"> started {ago(active.started_at)}</span>
            </p>
            <p className="muted">
              {active.phase === "drafting"
                ? `Found ${active.found} places, ${active.skipped} already known. Auditing and writing drafts.`
                : "Searching Google Maps."}
            </p>
            {active.to_process > 0 && (
              <>
                <div
                  className="meter"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={active.to_process}
                  aria-valuenow={active.processed}
                  aria-label="Drafting progress"
                >
                  <span style={{ width: `${Math.min(100, Math.round((active.processed / active.to_process) * 100))}%` }} />
                </div>
                <p className="muted">
                  {active.processed} of {active.to_process} new businesses done, {active.new_leads} saved
                  {active.failed > 0 ? `, ${active.failed} drafts failed` : ""}
                </p>
              </>
            )}
            {stalled && (
              <p className="notice notice-attn">
                No update for {ago(active.heartbeat_at)}. The pipeline may have stopped. It marks the run as interrupted the next time it starts.
              </p>
            )}
          </>
        ) : lastDone ? (
          <p>
            <strong>{lastDone.queries.join("; ") || "Search"}</strong>{" "}
            <span className="muted">
              {lastDone.status === "failed" ? "failed" : "finished"} {ago(lastDone.finished_at ?? lastDone.started_at)}: {lastDone.new_leads} new,{" "}
              {lastDone.skipped} already known{lastDone.failed ? `, ${lastDone.failed} drafts failed` : ""}
            </span>
          </p>
        ) : (
          <p className="muted">No scans yet. The first scheduled run is Monday morning, or start one above.</p>
        )}
      </section>

      <section className="card">
        <h2>History</h2>
        {state.runs.length === 0 ? (
          <p className="muted">Runs will show up here as they happen.</p>
        ) : (
          <div className="table-wrap">
            <table className="runs">
              <thead>
                <tr>
                  <th scope="col">Started</th>
                  <th scope="col">Search</th>
                  <th scope="col" className="num">Found</th>
                  <th scope="col" className="num">New</th>
                  <th scope="col" className="num">Known</th>
                  <th scope="col" className="num">Failed</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {state.runs.map((r) => (
                  <tr key={r.id}>
                    <td>{stamp(r.started_at)}</td>
                    <td>
                      {r.queries.join("; ") || "Search"}
                      <span className="muted"> {r.source === "manual" ? "(asked here)" : "(scheduled)"}</span>
                    </td>
                    <td className="num">{r.found}</td>
                    <td className="num">{r.new_leads}</td>
                    <td className="num">{r.skipped}</td>
                    <td className="num">{r.failed}</td>
                    <td>
                      <span className={`run-state run-${r.status}`}>
                        {r.status === "running" ? "Running" : r.status === "done" ? `Done ${duration(r)}` : "Failed"}
                      </span>
                      {r.error && <span className="muted"> {r.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
