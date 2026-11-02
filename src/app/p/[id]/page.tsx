"use client";
import { use } from "react";
import { Phone } from "@/components/Phone";
import { useLive } from "@/components/useLive";

export default function PhonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { s, err, act } = useLive(id, false);
  return <main className="phonepage">{s ? <Phone s={s} act={act} /> : <p>{err || "Connecting"}</p>}</main>;
}
