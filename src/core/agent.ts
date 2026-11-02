// Scripted agent: drives the same gateway a real agent uses. Used by the demo and the study.
import { DEMO_SCRIPT } from "./demo-data";
import { gatewayCall, releaseIfHeld, Session } from "./session";

export function scriptedTick(s: Session, now: number): { say?: string; done?: boolean } {
  if (s.status !== "running") return {};
  if (s.pending) { const r = releaseIfHeld(s, now); return r ? { say: "Running under your thumb." } : {}; }
  const step = DEMO_SCRIPT[s.agentCursor];
  if (!step) return { done: true };
  if (step.call) {
    const r = gatewayCall(s, s.agentToken, step.call, now);
    if (r.status === "refused" && /waiting/.test(r.reason)) return {};
  }
  s.agentCursor++;
  if (s.agentCursor >= DEMO_SCRIPT.length && !s.pending) { s.status = "done"; s.events.push({ at: now, kind: "done", text: step.say }); }
  return { say: step.say };
}
