import { useCallback, useEffect, useState } from "react";
import { fetchSettings, removeSecret, saveSecret } from "../api";
import type { SettingsState } from "../types";

const FIELDS = [
  { name: "deepseek_key", label: "DeepSeek API key", help: "Used to write emails, WhatsApp texts and the weekly review." },
  { name: "apify_token", label: "Apify token", help: "Used to scrape Google Maps for new leads." },
];

export default function Settings({ notify }: { notify: (m: string) => void }) {
  const [state, setState] = useState<SettingsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetchSettings().then(setState).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function save(name: string) {
    try {
      await saveSecret(name, values[name] ?? "");
      setValues((v) => ({ ...v, [name]: "" }));
      notify("Saved");
      load();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  async function remove(name: string) {
    try {
      await removeSecret(name);
      notify("Removed");
      load();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  if (error) return <p className="notice notice-error pad" role="alert">{error}</p>;
  if (!state) return <p className="muted pad">Loading</p>;

  return (
    <div className="insights">
      <section className="card">
        <h2>API keys</h2>
        <p className="muted">
          Keys are encrypted before they are stored and can't be read back from this page. To change one, save a new value.
        </p>
        {!state.encryption_ready && (
          <p className="notice notice-error" role="alert">
            Saving is switched off until you add a secret named SETTINGS_KEY (16+ random characters) to the Pages project and redeploy.
            The pipeline needs the same value in its .env.
          </p>
        )}
        {FIELDS.map((f) => {
          const current = state.keys[f.name];
          return (
            <div className="secret-row" key={f.name}>
              <label htmlFor={f.name}>
                <strong>{f.label}</strong>
                <span className="muted"> {f.help}</span>
              </label>
              <p className="muted">
                {current
                  ? `Set, ends in ${current.hint ?? "????"}. Updated ${new Date(current.updated_at).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}.`
                  : "Not set."}
              </p>
              <div className="actions">
                <input
                  id={f.name}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={current ? "Paste a new key to replace it" : "Paste key"}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
                <button
                  className="btn btn-primary"
                  disabled={!state.encryption_ready || (values[f.name] ?? "").trim().length < 8}
                  onClick={() => save(f.name)}
                >
                  Save
                </button>
                {current && (
                  <button className="btn btn-quiet" onClick={() => remove(f.name)}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
