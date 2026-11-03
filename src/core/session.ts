// Session engine: the gateway's state machine. Storage is injected, so the same code runs on
// the server (live mode) and in the browser (the judges' demo).
import { checkCall, Contract, ToolCall } from "./contract";
import { execute, newSandbox, Sandbox } from "./sandbox";

export type Status = "awaiting-approval" | "running" | "stopped" | "done";
export type EventKind = "plan" | "approved" | "allowed" | "held" | "needs-hold" | "human-allowed" | "human-denied"
  | "held-run" | "refused" | "stopped" | "hold-start" | "hold-release" | "done";

export interface BrekEvent { at: number; kind: EventKind; text: string; tool?: string; }
export interface Pending { handle: string; call: ToolCall; kind: "deviation" | "irreversible"; reason: string; explanation?: string; }
export type Resolution = { handle: string; decision: "allowed" | "denied" | "stopped" };

export interface Session {
  id: string; task: string; plan: string; status: Status; contract: Contract;
  agentToken: string; tokenRevoked: boolean; approvedAt?: number;
  callCount: number; silentCalls: number; interruptions: number;
  pending?: Pending; lastResolution?: Resolution; holdUntil: number;
  events: BrekEvent[]; sandbox: Sandbox;
  agentCursor: number; agentHistory: unknown[];
  retryAt?: number; lastError?: string;
}

export const HOLD_LEASE_MS = 2500;
const rid = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);

export function createSession(task: string, plan: string, contract: Contract, now: number, id = rid()): Session {
  return {
    id, task, plan, contract, status: "awaiting-approval", agentToken: "brk_" + rid(), tokenRevoked: false,
    callCount: 0, silentCalls: 0, interruptions: 0, holdUntil: 0, sandbox: newSandbox(), agentCursor: 0, agentHistory: [],
    events: [{ at: now, kind: "plan", text: "Agent submitted a plan." }],
  };
}

const log = (s: Session, at: number, kind: EventKind, text: string, tool?: string) => { s.events.push({ at, kind, text, tool }); };

export function approve(s: Session, now: number) {
  if (s.status !== "awaiting-approval") return;
  s.status = "running"; s.approvedAt = now;
  log(s, now, "approved", "You approved the plan. Session token issued.");
}

export function stop(s: Session, now: number) {
  if (s.status === "stopped") return;
  s.status = "stopped"; s.tokenRevoked = true; s.holdUntil = 0;
  if (s.pending) { s.lastResolution = { handle: s.pending.handle, decision: "stopped" }; s.pending = undefined; }
  log(s, now, "stopped", "Stop pressed. Token revoked at the gateway.");
}

export function holdHeartbeat(s: Session, now: number) {
  if (s.status !== "running") return;
  if (s.holdUntil <= now) log(s, now, "hold-start", "You are holding the switch.");
  s.holdUntil = now + HOLD_LEASE_MS;
}

export function holdRelease(s: Session, now: number) {
  if (s.holdUntil > 0) log(s, now, "hold-release", "You lifted your thumb. Irreversible calls are frozen.");
  s.holdUntil = 0;
}

export type GatewayResult =
  | { status: "ok"; output: string; ok: boolean }
  | { status: "held"; handle: string }
  | { status: "denied"; reason: string }
  | { status: "refused"; reason: string };

function run(s: Session, call: ToolCall) {
  const r = execute(s.sandbox, call);
  return { status: "ok" as const, output: r.output, ok: r.ok };
}

export function gatewayCall(s: Session, token: string, call: ToolCall, now: number): GatewayResult {
  const refuse = (reason: string): GatewayResult => { log(s, now, "refused", reason, call.tool); return { status: "refused", reason }; };
  if (token !== s.agentToken) return refuse("Wrong token.");
  if (s.tokenRevoked) return refuse("Token revoked.");
  if (s.status !== "running") return refuse(`Session is ${s.status}.`);
  if (s.pending) return refuse("Another call is waiting for a human.");
  if (s.approvedAt !== undefined && now > s.approvedAt + s.contract.expiresInMinutes * 60000) { stop(s, now); return { status: "refused", reason: "Contract expired." }; }
  if (s.callCount >= s.contract.maxCalls) { stop(s, now); return { status: "refused", reason: "Call budget used up." }; }
  s.callCount++;
  const v = checkCall(s.contract, call);
  if (v.verdict === "allow") {
    s.silentCalls++;
    log(s, now, "allowed", describe(call), call.tool);
    return run(s, call);
  }
  if (v.verdict === "needs-hold" && s.holdUntil > now) {
    log(s, now, "held-run", `${describe(call)} ran under your thumb.`, call.tool);
    return run(s, call);
  }
  const handle = rid();
  s.pending = v.verdict === "hold"
    ? { handle, call, kind: "deviation", reason: v.reason }
    : { handle, call, kind: "irreversible", reason: "This step cannot be undone. Hold the switch to let it run." };
  s.interruptions++;
  log(s, now, v.verdict === "hold" ? "held" : "needs-hold", `${describe(call)}: ${s.pending.reason}`, call.tool);
  return { status: "held", handle };
}

// A one-time human decision about a single held call. It widens nothing else.
export function decide(s: Session, handle: string, decision: "allow" | "deny", now: number): GatewayResult {
  if (!s.pending || s.pending.handle !== handle) return { status: "refused", reason: "Nothing is waiting under that handle." };
  const call = s.pending.call;
  s.pending = undefined;
  if (decision === "deny") {
    s.lastResolution = { handle, decision: "denied" };
    log(s, now, "human-denied", `You denied ${describe(call)}.`, call.tool);
    return { status: "denied", reason: "Human denied this call. It is outside the approved plan. Find a route inside the plan." };
  }
  s.lastResolution = { handle, decision: "allowed" };
  log(s, now, "human-allowed", `You allowed ${describe(call)} once.`, call.tool);
  return run(s, call);
}

// When the human starts holding, a waiting irreversible call may proceed.
export function releaseIfHeld(s: Session, now: number): GatewayResult | null {
  if (s.pending?.kind !== "irreversible" || s.holdUntil <= now) return null;
  const { call, handle } = s.pending;
  s.pending = undefined;
  s.lastResolution = { handle, decision: "allowed" };
  log(s, now, "held-run", `${describe(call)} ran under your thumb.`, call.tool);
  return run(s, call);
}

export function describe(call: ToolCall): string {
  const a = call.args;
  const target = [a.env, a.path, a.name, a.volume, a.url].filter(Boolean).join(" ");
  const sql = typeof a.sql === "string" ? `"${a.sql.slice(0, 60)}"` : "";
  return [call.tool, target, sql].filter(Boolean).join(" ");
}
