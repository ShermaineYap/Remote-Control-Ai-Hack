"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Live() {
  const [task, setTask] = useState("Fix the failed invoice migration on staging.");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const router = useRouter();
  const go = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task }) });
    const d = await r.json();
    if (r.ok) router.push(`/s/${d.id}`); else { setErr(d.error); setBusy(false); }
  };
  return (
    <main className="livepage">
      <div className="brand">Brek</div>
      <h1>Give a live AI agent a job</h1>
      <p>It runs on the same fake infrastructure as the demo. Your phone becomes the control.</p>
      <label htmlFor="task">Task</label>
      <textarea id="task" rows={3} value={task} onChange={(e) => setTask(e.target.value)} />
      <button className="primary dark" disabled={busy} onClick={go}>{busy ? "Writing the contract" : "Write the contract"}</button>
      {err && <p role="alert">{err}</p>}
    </main>
  );
}
