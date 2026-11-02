"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { scriptedTick } from "@/core/agent";
import { DEMO_RECORDING, DEMO_TASK, demoContract } from "@/core/demo-data";
import { approve, createSession, decide, holdHeartbeat, holdRelease, Session, stop } from "@/core/session";
import { Console } from "./Console";
import { Action, Phone } from "./Phone";

const fresh = () => createSession(DEMO_TASK, DEMO_RECORDING.plan, demoContract(), Date.now(), "demo");

// The real checker and session engine, running in this browser with fake data. No key, no quota.
export function Demo() {
  const ref = useRef<Session | null>(null);
  const [, bump] = useState(0);
  const [say, setSay] = useState("");
  const render = useCallback(() => bump((n) => n + 1), []);
  useEffect(() => { ref.current = fresh(); render(); }, [render]);

  useEffect(() => {
    const t = setInterval(() => {
      const s = ref.current;
      if (!s || s.status !== "running") return;
      const r = scriptedTick(s, Date.now());
      if (r.say) setSay(r.say);
      render();
    }, 900);
    return () => clearInterval(t);
  }, [render]);

  const act = (a: Action) => {
    const s = ref.current; if (!s) return;
    const now = Date.now();
    if (a === "approve") approve(s, now);
    if (a === "stop") stop(s, now);
    if (a === "hold") holdHeartbeat(s, now);
    if (a === "release") holdRelease(s, now);
    if ((a === "allow" || a === "deny") && s.pending) decide(s, s.pending.handle, a, now);
    render();
  };
  const s = ref.current;
  if (!s) return <div className="stage" />;
  return (
    <div className="stage">
      <Console s={s} say={say} />
      <div className="device"><Phone s={s} act={act} explanation={DEMO_RECORDING.explanation} /></div>
      <div className="stagefoot">
        <button className="link" onClick={() => { ref.current = fresh(); setSay(""); render(); }}>Start the demo again</button>
        <span>{DEMO_RECORDING.source === "recorded" ? `Contract and alert text recorded from ${DEMO_RECORDING.model}.` : "Contract and alert text are written by hand in this demo."} Enforcement runs for real in your browser. All data is fake.</span>
      </div>
    </div>
  );
}
