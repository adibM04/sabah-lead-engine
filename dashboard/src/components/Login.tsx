import { useState } from "react";
import { configured, supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <h1>Lead Desk</h1>
        <p className="muted">Review drafts, send from Zoho, track replies.</p>

        {!configured && (
          <p className="notice" role="alert">
            Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code> and fill in the
            project URL and anon key.
          </p>
        )}

        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}

        <button className="btn btn-primary" disabled={busy || !configured}>
          {busy ? "Signing in" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
