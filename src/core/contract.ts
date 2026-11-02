// The enforcement core. Pure, deterministic, no LLM. Everything here runs outside the model.

export type Effect = "read" | "write" | "destructive";
export type Env = "staging" | "production" | "unknown" | "none";

export interface ToolCall { tool: string; args: Record<string, unknown>; }

export interface Rule {
  tool: string;
  env?: "staging" | "production";
  path?: string;        // glob, supports * and **
  maxEffect?: Effect;   // the strongest effect this rule permits
}

export interface Contract {
  goal: string;
  summary: string;
  touches: string[];
  offLimits: string[];
  allow: Rule[];
  irreversible: Rule[]; // permitted only while the human holds the phone
  maxCalls: number;
  expiresInMinutes: number;
}

export const KNOWN_TOOLS: Record<string, { base: Effect; needsEnv: boolean; hasPath: boolean; }> = {
  "files.list": { base: "read", needsEnv: false, hasPath: true },
  "files.read": { base: "read", needsEnv: false, hasPath: true },
  "db.query": { base: "read", needsEnv: true, hasPath: false },       // effect is derived from the SQL
  "db.migrate": { base: "write", needsEnv: true, hasPath: false },
  "deploy.restart": { base: "write", needsEnv: true, hasPath: false },
  "volume.delete": { base: "destructive", needsEnv: true, hasPath: false },
  "http.post": { base: "write", needsEnv: false, hasPath: false },
};

const RANK: Record<Effect, number> = { read: 0, write: 1, destructive: 2 };

export function normaliseEnv(value: unknown): Env {
  if (value === undefined || value === null) return "none";
  const v = String(value).normalize("NFKC").trim().toLowerCase();
  if (["production", "prod", "prd", "live", "main"].includes(v)) return "production";
  if (["staging", "stage", "stg"].includes(v)) return "staging";
  return "unknown";
}

// Returns a safe relative path, or null if it could escape or hide its target.
export function normalisePath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  let p = value.normalize("NFKC");
  try { p = decodeURIComponent(p); } catch { return null; }
  if (p.includes("%")) return null;           // double encoding
  if (p.includes("\\") || p.includes("\0")) return null;
  if (p.startsWith("/") || p.startsWith("~")) return null;
  p = p.replace(/^(\.\/)+/, "");
  if (p.split("/").some((s) => s === ".." || s === ".")) return null;
  return p;
}

export function globMatch(glob: string, path: string): boolean {
  const re = glob.split("/").map((seg) => {
    if (seg === "**") return "\u0000";
    return seg.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  }).join("/").replace(/\u0000\//g, "(?:[^/]+/)*").replace(/\/\u0000$/, "(?:/.*)?").replace(/\u0000/g, ".*");
  return new RegExp(`^${re}$`).test(path);
}

// Conservative SQL classifier. Unknown statements count as destructive, so it fails closed.
export function classifySql(sql: unknown): Effect {
  if (typeof sql !== "string" || !sql.trim()) return "destructive";
  const stripped = sql.normalize("NFKC")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .toUpperCase();
  if (/\b(DROP|TRUNCATE|ALTER|GRANT|REVOKE|CREATE|COPY|VACUUM|EXECUTE|CALL|DO|MERGE)\b/.test(stripped)) return "destructive";
  const statements = stripped.split(";").map((s) => s.trim()).filter(Boolean);
  let effect: Effect = "read";
  for (const s of statements) {
    if (/\bDELETE\b/.test(s)) { if (!/\bWHERE\b/.test(s)) return "destructive"; effect = "write"; continue; }
    if (/\bUPDATE\b/.test(s)) { if (!/\bWHERE\b/.test(s)) return "destructive"; effect = "write"; continue; }
    if (/\bINSERT\b/.test(s)) { effect = "write"; continue; }
    if (/^(SELECT|WITH|SHOW|EXPLAIN)\b/.test(s)) continue;
    return "destructive";
  }
  return effect;
}

export interface Facts { known: boolean; effect: Effect; env: Env; path: string | null; badPath: boolean; }

// The gateway derives facts from the call itself and never trusts the agent's description of it.
export function factsOf(call: ToolCall): Facts {
  const def = KNOWN_TOOLS[call.tool];
  if (!def) return { known: false, effect: "destructive", env: "unknown", path: null, badPath: false };
  const effect = call.tool === "db.query" ? classifySql(call.args.sql) : def.base;
  const env = def.needsEnv ? normaliseEnv(call.args.env) : "none";
  const path = def.hasPath ? normalisePath(call.args.path) : null;
  return { known: true, effect, env, path, badPath: def.hasPath && path === null };
}

function ruleMatches(rule: Rule, call: ToolCall, f: Facts): boolean {
  if (rule.tool !== call.tool) return false;
  if (rule.env && f.env !== rule.env) return false;
  if (KNOWN_TOOLS[call.tool]?.needsEnv && !rule.env) return false; // an env-bound tool needs an explicit env
  if (rule.path && (!f.path || !globMatch(rule.path, f.path))) return false;
  if (KNOWN_TOOLS[call.tool]?.hasPath && !rule.path) return false;
  if (RANK[f.effect] > RANK[rule.maxEffect ?? KNOWN_TOOLS[call.tool]?.base ?? "read"]) return false;
  return true;
}

export type Verdict =
  | { verdict: "allow"; rule: Rule }
  | { verdict: "needs-hold"; rule: Rule }
  | { verdict: "hold"; reason: string };

export function checkCall(contract: Contract, call: ToolCall): Verdict {
  const f = factsOf(call);
  if (!f.known) return { verdict: "hold", reason: `Unknown tool ${call.tool}, not in the plan.` };
  if (f.badPath) return { verdict: "hold", reason: `Path is unsafe or could escape the project: ${String(call.args.path)}` };
  if (KNOWN_TOOLS[call.tool].needsEnv && f.env === "unknown") return { verdict: "hold", reason: `Unrecognised environment "${String(call.args.env)}".` };
  const irreversible = contract.irreversible.find((r) => ruleMatches(r, call, f));
  if (irreversible) return { verdict: "needs-hold", rule: irreversible };
  const rule = contract.allow.find((r) => ruleMatches(r, call, f));
  if (rule) return { verdict: "allow", rule };
  const parts = [`${call.tool} is a ${f.effect} action`];
  if (f.env !== "none") parts.push(`on ${f.env}`);
  if (f.path) parts.push(`at ${f.path}`);
  return { verdict: "hold", reason: `${parts.join(" ")}, which the approved plan does not cover.` };
}

// Hardens a contract proposed by the LLM. The model may propose, but it cannot widen these limits.
export function hardenContract(input: unknown): Contract {
  const c = (input ?? {}) as Partial<Contract>;
  const clean = (rules: unknown): Rule[] => (Array.isArray(rules) ? rules : []).flatMap((r): Rule[] => {
    const x = r as Rule;
    const def = KNOWN_TOOLS[x?.tool];
    if (!def) return [];
    const env = normaliseEnv(x.env);
    if (def.needsEnv && env !== "staging" && env !== "production") return [];
    const path = def.hasPath ? (typeof x.path === "string" && !x.path.includes("..") && !x.path.startsWith("/") ? x.path : null) : undefined;
    if (def.hasPath && !path) return [];
    if (x.tool === "http.post") return [];
    const rule: Rule = { tool: x.tool };
    if (def.needsEnv) rule.env = env as "staging" | "production";
    if (path) rule.path = path;
    rule.maxEffect = x.maxEffect && x.maxEffect in RANK ? x.maxEffect : def.base;
    return [rule];
  });
  const allow: Rule[] = [], irreversible = clean(c.irreversible);
  for (const r of clean(c.allow)) {
    // Destructive rights never land in the silent list, whatever the model says.
    if (r.maxEffect === "destructive" || r.tool === "volume.delete") irreversible.push(r);
    else allow.push(r);
  }
  const text = (v: unknown, n = 240) => String(v ?? "").slice(0, n);
  const list = (v: unknown) => (Array.isArray(v) ? v : []).slice(0, 6).map((s) => text(s, 80));
  return {
    goal: text(c.goal), summary: text(c.summary, 400), touches: list(c.touches), offLimits: list(c.offLimits),
    allow, irreversible,
    maxCalls: Math.min(Math.max(Number(c.maxCalls) || 40, 1), 200),
    expiresInMinutes: Math.min(Math.max(Number(c.expiresInMinutes) || 30, 1), 120),
  };
}
