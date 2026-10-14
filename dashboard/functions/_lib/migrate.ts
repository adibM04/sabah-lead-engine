import type { Env } from "./access";
import { MIGRATIONS } from "./migrations.generated";

// The app brings its own database up to date, so a deploy from GitHub is enough:
// no wrangler on a laptop. It uses the same bookkeeping table as `wrangler d1 migrations apply`,
// so the two ways of migrating never fight each other.

const BENIGN = /already exists|duplicate column name/i;

let ready: Promise<void> | null = null;

async function run(db: D1Database): Promise<void> {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    )
    .run();
  const { results } = await db.prepare("SELECT name FROM d1_migrations").all<{ name: string }>();
  const done = new Set(results.map((r) => r.name));

  for (const m of MIGRATIONS) {
    if (done.has(m.name)) continue;
    for (const sql of m.statements) {
      try {
        await db.prepare(sql).run();
      } catch (e) {
        // A half-finished earlier attempt, or another request racing us, already did this statement.
        if (!BENIGN.test(String((e as Error).message))) {
          throw new Error(`Migration ${m.name} failed: ${(e as Error).message}`);
        }
      }
    }
    await db.prepare("INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)").bind(m.name).run();
  }
}

/** Runs once per worker instance. A failure is not cached, so the next request tries again. */
export function ensureMigrated(env: Env): Promise<void> {
  if (!ready) {
    ready = run(env.DB).catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}
