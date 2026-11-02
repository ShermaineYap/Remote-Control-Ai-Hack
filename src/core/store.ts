import type { Session } from "./session";

const url = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const hasRedis = () => Boolean(url() && token());
export const storeShared = hasRedis;

async function redis(...cmd: (string | number)[]) {
  const r = await fetch(url()!, { method: "POST", headers: { authorization: `Bearer ${token()}` }, body: JSON.stringify(cmd), cache: "no-store" });
  if (!r.ok) throw new Error(`Store returned ${r.status}`);
  return (await r.json()).result;
}

const g = globalThis as unknown as { __brek?: Map<string, Session> };
const mem = () => (g.__brek ??= new Map());

export async function getSession(id: string): Promise<Session | null> {
  if (!hasRedis()) return mem().get(id) ?? null;
  const v = await redis("GET", `s:${id}`);
  return v ? (JSON.parse(v) as Session) : null;
}

export async function putSession(s: Session) {
  if (!hasRedis()) { mem().set(s.id, s); return; }
  await redis("SET", `s:${s.id}`, JSON.stringify(s), "EX", 3600);
}

// Serialises read-modify-write, so the phone and the agent can't overwrite each other.
export async function updateSession<T>(id: string, fn: (s: Session) => T | Promise<T>): Promise<{ session: Session; result: T } | null> {
  if (!hasRedis()) { const s = mem().get(id); return s ? { session: s, result: await fn(s) } : null; }
  const lock = `l:${id}`;
  for (let i = 0; i < 40; i++) {
    if (await redis("SET", lock, "1", "NX", "PX", 8000)) {
      try {
        const s = await getSession(id);
        if (!s) return null;
        const result = await fn(s);
        await putSession(s);
        return { session: s, result };
      } finally { await redis("DEL", lock); }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Session is busy");
}

// Daily cap so a public link can't burn the free LLM quota.
export async function spendQuota(limit: number): Promise<boolean> {
  if (!hasRedis()) return true;
  const key = `q:${new Date().toISOString().slice(0, 10)}`;
  const n = await redis("INCR", key);
  if (n === 1) await redis("EXPIRE", key, 90000);
  return n <= limit;
}
