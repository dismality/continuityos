import postgres from "postgres";
import { integrations } from "@/lib/env";

/**
 * Saves the live session (timetable, chats, notices, logs) to Postgres so a restart or a sleeping
 * free-tier server picks up exactly where it left off. One row, JSON. Without DATABASE_URL it does
 * nothing and the session lives in memory, as before.
 */

type Sql = ReturnType<typeof postgres>;
const g = globalThis as unknown as { __continuitySql?: Sql | null; __continuityTable?: Promise<unknown> };

function sql(): Sql | null {
  if (!integrations.database) return null;
  if (g.__continuitySql === undefined) g.__continuitySql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false, idle_timeout: 20 });
  return g.__continuitySql;
}

async function table(q: Sql) {
  g.__continuityTable ??= q`create table if not exists continuity_live_state (
    id text primary key,
    state jsonb not null,
    updated_at timestamptz not null default now()
  )`;
  await g.__continuityTable;
}

export const persistenceEnabled = () => integrations.database;

export async function loadState<T>(key = "default"): Promise<T | null> {
  const q = sql();
  if (!q) return null;
  await table(q);
  const rows = await q<{ state: T }[]>`select state from continuity_live_state where id = ${key}`;
  return rows[0]?.state ?? null;
}

export async function saveState(state: unknown, key = "default") {
  const q = sql();
  if (!q) return;
  await table(q);
  await q`insert into continuity_live_state (id, state, updated_at)
          values (${key}, ${q.json(state as Parameters<Sql["json"]>[0])}, now())
          on conflict (id) do update set state = excluded.state, updated_at = now()`;
}
