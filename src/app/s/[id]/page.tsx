"use client";
import { QRCodeSVG } from "qrcode.react";
import { use, useEffect, useState } from "react";
import { Console } from "@/components/Console";
import { Phone } from "@/components/Phone";
import { useLive } from "@/components/useLive";

export default function LiveConsole({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { s, err, act } = useLive(id, true);
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(`${location.origin}/p/${id}`), [id]);
  if (!s) return <main className="livepage"><p>{err || "Loading session"}</p></main>;
  return (
    <main><div className="stage">
      <Console s={s} />
      <div className="device"><Phone s={s} act={act} /></div>
      <div className="stagefoot">{url && <QRCodeSVG value={url} size={96} bgColor="#F5C400" />}<span>Scan to use your own phone as the control. {err}</span></div>
    </div></main>
  );
}
