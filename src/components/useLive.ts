"use client";
import { useCallback, useEffect, useState } from "react";
import type { Action, PublicSession } from "./Phone";

export function useLive(id: string, drive: boolean) {
  const [s, set] = useState<PublicSession | null>(null);
  const [err, setErr] = useState("");
  const post = useCallback(async (action: string) => {
    const r = await fetch(`/api/session/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    const d = await r.json();
    if (r.ok) { set(d); setErr(""); } else setErr(d.error);
  }, [id]);
  useEffect(() => {
    let on = true;
    const poll = async () => {
      if (drive) await post("tick");
      else { const r = await fetch(`/api/session/${id}`); const d = await r.json(); if (r.ok) set(d); else setErr(d.error); }
      if (on) setTimeout(poll, drive ? 1500 : 1000);
    };
    poll();
    return () => { on = false; };
  }, [id, drive, post]);
  return { s, err, act: (a: Action) => void post(a) };
}
