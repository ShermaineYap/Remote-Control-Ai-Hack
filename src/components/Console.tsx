"use client";
import type { PublicSession } from "./Phone";

const TONE: Record<string, string> = { allowed: "ok", "held-run": "ok", "human-allowed": "warn", held: "warn", "needs-hold": "warn", "human-denied": "bad", refused: "bad", stopped: "bad" };
const WHEN: Record<string, string> = { allowed: "ran", "held-run": "ran", "human-allowed": "you allowed", held: "held", "needs-hold": "needs you", "human-denied": "denied", refused: "refused", stopped: "stopped", approved: "approved", plan: "plan", done: "done", "hold-start": "holding", "hold-release": "lifted" };

export function Console({ s, say }: { s: PublicSession; say?: string }) {
  const db = s.sandbox.db;
  return (
    <div className="console">
      <div className="task"><strong>Task</strong> {s.task}</div>
      <div className="envs">
        {(["staging", "production"] as const).map((e) => (
          <div key={e} className={`env ${s.sandbox.volumes[e] ? "" : "gone"}`}>
            <strong>{e === "staging" ? "Staging" : "Production"}</strong>
            <span>{s.sandbox.volumes[e] ? `${db[e].bookings.toLocaleString("en-MY")} bookings` : "Volume deleted"}</span>
            <small>{db[e].migrated.length ? `${db[e].migrated.length} of 3 batches applied` : "Fake data"}</small>
          </div>
        ))}
      </div>
      {say && <p className="say">Agent: {say}</p>}
      <ol className="log" aria-live="polite">
        {[...s.events].reverse().slice(0, 14).map((e, i) => (
          <li key={s.events.length - i} className={TONE[e.kind] ?? ""}><b>{WHEN[e.kind] ?? e.kind}</b><span>{e.text}</span></li>
        ))}
      </ol>
    </div>
  );
}
