"use client";
import { useEffect, useRef } from "react";
import type { Session } from "@/core/session";

export type PublicSession = Omit<Session, "agentToken">;
export type Action = "approve" | "allow" | "deny" | "stop" | "hold" | "release";

function Sign({ tone, mark }: { tone: "go" | "warn" | "stop"; mark: string }) {
  return <div className={`sign ${tone}`} aria-hidden="true"><span>{mark}</span></div>;
}

function HoldButton({ act, holding }: { act: (a: Action) => void; holding: boolean }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const start = () => { if (timer.current) return; act("hold"); timer.current = setInterval(() => act("hold"), 800); };
  const end = () => { if (!timer.current) return; clearInterval(timer.current); timer.current = null; act("release"); };
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  return (
    <button className={`hold ${holding ? "on" : ""}`} onPointerDown={start} onPointerUp={end} onPointerLeave={end} onPointerCancel={end}
      onKeyDown={(e) => { if (e.key === " " && !e.repeat) { e.preventDefault(); start(); } }} onKeyUp={(e) => { if (e.key === " ") end(); }}
      onContextMenu={(e) => e.preventDefault()}>
      {holding ? "Running. Lift to freeze" : "Hold to run"}
    </button>
  );
}

export function Phone({ s, act, explanation }: { s: PublicSession; act: (a: Action) => void; explanation?: string }) {
  const c = s.contract;
  const holding = s.holdUntil > Date.now();
  const stopBtn = <button className="stopbtn" onClick={() => act("stop")}>Stop agent</button>;

  if (s.status === "awaiting-approval") return (
    <div className="screen">
      <h2>Approve this plan?</h2>
      <p className="lead">{c.summary}</p>
      <h3>Will touch</h3><ul>{c.touches.map((t) => <li key={t}>{t}</li>)}</ul>
      <h3>Won&apos;t touch</h3><ul>{c.offLimits.map((t) => <li key={t}>{t}</li>)}</ul>
      <h3>Can&apos;t be undone</h3>
      <p>{c.irreversible.length ? c.irreversible.map((r) => `${r.tool} on ${r.env}`).join(", ") + ". You hold the switch for these." : "Nothing."}</p>
      <button className="primary" onClick={() => act("approve")}>Approve plan</button>
    </div>
  );

  if (s.status === "stopped") return (
    <div className="screen centre"><Sign tone="stop" mark="■" /><h2>Agent stopped</h2><p>Its token is revoked. Calls now fail at the gateway.</p></div>
  );

  if (s.status === "done") return (
    <div className="screen centre"><Sign tone="go" mark="✓" /><h2>Job finished</h2>
      <p>{s.silentCalls} calls ran without bothering you. {s.interruptions} needed you.</p></div>
  );

  if (s.pending?.kind === "deviation") return (
    <div className="screen">
      <Sign tone="warn" mark="!" />
      <h2>Not in your plan</h2>
      <p className="lead">{explanation ?? s.pending.explanation ?? s.pending.reason}</p>
      <code className="call">{s.pending.call.tool} {JSON.stringify(s.pending.call.args)}</code>
      <button className="primary deny" onClick={() => act("deny")}>Deny</button>
      <button className="ghost" onClick={() => act("allow")}>Allow once</button>
    </div>
  );

  if (s.pending?.kind === "irreversible" || holding) return (
    <div className="screen centre">
      <Sign tone="warn" mark="✋" />
      <h2>{holding ? "You have the switch" : "This step can't be undone"}</h2>
      {s.pending && <code className="call">{s.pending.call.tool} {String(s.pending.call.args.name ?? "")}</code>}
      <HoldButton act={act} holding={holding} />
      {stopBtn}
    </div>
  );

  return (
    <div className="screen centre">
      <Sign tone="go" mark="✓" /><h2>On plan</h2>
      <p>{s.silentCalls} calls ran. None needed you.</p>
      {stopBtn}
    </div>
  );
}
