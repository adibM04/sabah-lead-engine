import { useCallback, useEffect, useState } from "react";
import { decidePlaybook, fetchDigest, fetchPlaybook, fetchQueries, fetchStats, setQueryStatus } from "../api";
import type { Digest, FunnelRow, PlaybookState, SearchQuery, Stats } from "../types";
import { PITCH_LABEL } from "./pitch";

type Op = { kind: "same" | "add" | "del"; text: string };

// Line diff (longest common subsequence). Playbooks are short, so this is cheap.
function diffLines(a: string, b: string): Op[] {
  const x = a.split("\n");
  const y = b.split("\n");
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) out.push({ kind: "same", text: x[i++] }), j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "del", text: x[i++] });
    else out.push({ kind: "add", text: y[j++] });
  }
  while (i < x.length) out.push({ kind: "del", text: x[i++] });
  while (j < y.length) out.push({ kind: "add", text: y[j++] });
  return out;
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}


function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "0%";
}

function Funnel({ stats }: { stats: Stats }) {
  const t = stats.total;
  const steps = [
    { label: "Leads found", n: t.leads, of: t.leads },
    { label: "Contacted", n: t.contacted, of: t.leads },
    { label: "Replied", n: t.replied, of: t.contacted },
    { label: "Won", n: t.won, of: t.replied },
  ];
  return (
    <>
      <ol className="funnel" aria-label="Lead funnel">
        {steps.map((st, i) => (
          <li key={st.label}>
            <span className="funnel-label">{st.label}</span>
            <span className="funnel-track">
              <span className="funnel-fill" style={{ width: `${t.leads ? Math.max(st.n ? 2 : 0, (st.n / t.leads) * 100) : 0}%` }} />
            </span>
            <span className="funnel-n">
              {st.n}
              {i > 0 && <small> {pct(st.n, st.of)} of {steps[i - 1].label.toLowerCase()}</small>}
            </span>
          </li>
        ))}
      </ol>
      {t.contacted < 10 && (
        <p className="muted">Small numbers so far. Treat the percentages as a rough guide until about 30 leads are contacted.</p>
      )}
    </>
  );
}

function Breakdown({ title, rows, map }: { title: string; rows: FunnelRow[]; map?: (l: string) => string }) {
  if (rows.length === 0) return null;
  return (
    <div className="table-wrap">
      <table className="runs breakdown">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            <th scope="col">{title}</th>
            <th scope="col" className="num">Leads</th>
            <th scope="col" className="num">Contacted</th>
            <th scope="col" className="num">Replied</th>
            <th scope="col" className="num">Won</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.label)}>
              <td>{map ? map(String(r.label)) : String(r.label)}</td>
              <td className="num">{r.leads}</td>
              <td className="num">{r.contacted}</td>
              <td className="num">
                {r.replied}
                {r.contacted > 0 && <small className="muted"> {pct(r.replied, r.contacted)}</small>}
              </td>
              <td className="num">{r.won}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  notify: (m: string) => void;
  onChanged: () => void;
}

export default function Insights({ notify, onChanged }: Props) {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [pb, setPb] = useState<PlaybookState | null>(null);
  const [queries, setQueries] = useState<SearchQuery[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchStats().then(setStats).catch(() => setStats(null));
    Promise.all([fetchDigest(), fetchPlaybook(), fetchQueries()])
      .then(([d, p, q]) => {
        setDigest(d);
        setPb(p);
        setQueries(q);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function decide(version: number, action: "approve" | "reject") {
    try {
      await decidePlaybook(version, action);
      notify(action === "approve" ? "Playbook approved. Unedited drafts will refresh on the next run." : "Proposal rejected");
      load();
      onChanged();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  async function decideQuery(id: number, status: SearchQuery["status"]) {
    try {
      await setQueryStatus(id, status);
      load();
      onChanged();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  if (error) return <p className="notice notice-error pad" role="alert">{error}</p>;
  if (!pb) return <p className="muted pad">Loading</p>;

  const suggested = queries.filter((q) => q.status === "suggested");
  const active = queries.filter((q) => q.status === "active");

  return (
    <div className="insights">
      {stats && (
        <section className="card">
          <h2>Funnel</h2>
          <Funnel stats={stats} />
          {stats.total.contacted > 0 && (
            <>
              <Breakdown title="Category" rows={stats.by_category} />
              <Breakdown title="Pitch" rows={stats.by_pitch} map={(l) => PITCH_LABEL[l] ?? l} />
              {stats.by_playbook.length > 1 && <Breakdown title="Playbook version" rows={stats.by_playbook} map={(l) => `Version ${l}`} />}
            </>
          )}
        </section>
      )}

      <section className="card">
        <h2>Last weekly review</h2>
        {digest ? (
          <>
            <p className="muted">{when(digest.ran_at)}</p>
            <div className="digest">{digest.digest}</div>
          </>
        ) : (
          <p className="muted">No review yet. The weekly job writes one every Monday morning.</p>
        )}
      </section>

      <section className="card">
        <h2>Playbook</h2>
        {pb.proposed ? (
          <>
            <p>
              <strong>Version {pb.proposed.version} is waiting for your decision.</strong>
            </p>
            {pb.proposed.rationale && <div className="digest">{pb.proposed.rationale}</div>}
            <div className="diff" aria-label="Changes from the active playbook">
              {diffLines(pb.active?.content ?? "", pb.proposed.content).map((op, i) => (
                <div key={i} className={`diff-line diff-${op.kind}`}>
                  <span aria-hidden="true">{op.kind === "add" ? "+" : op.kind === "del" ? "-" : " "}</span>
                  {op.text || " "}
                </div>
              ))}
            </div>
            <div className="actions">
              <button className="btn btn-primary" onClick={() => decide(pb.proposed!.version, "approve")}>
                Approve v{pb.proposed.version}
              </button>
              <button className="btn" onClick={() => decide(pb.proposed!.version, "reject")}>
                Reject
              </button>
            </div>
          </>
        ) : (
          <p className="muted">No changes proposed. The agent only proposes when it has enough sent messages or edits to learn from.</p>
        )}
        {pb.active && (
          <details className="active-playbook">
            <summary>Active playbook (v{pb.active.version})</summary>
            <pre>{pb.active.content}</pre>
          </details>
        )}
      </section>

      <section className="card">
        <h2>Search queries</h2>
        {suggested.length > 0 && (
          <ul className="query-list" aria-label="Suggested queries">
            {suggested.map((q) => (
              <li key={q.id}>
                <div>
                  <strong>{q.query}</strong>
                  {q.reason && <p className="muted">{q.reason}</p>}
                </div>
                <div className="actions">
                  <button className="btn btn-primary" onClick={() => decideQuery(q.id, "active")}>
                    Use
                  </button>
                  <button className="btn btn-quiet" onClick={() => decideQuery(q.id, "rejected")}>
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">
          {active.length} active: {active.map((q) => q.query).join("; ") || "none yet (the first pipeline run seeds them)"}
        </p>
      </section>
    </div>
  );
}
