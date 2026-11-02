import { NextResponse } from "next/server";
import { compilePlan, llmConfigured } from "@/core/llm";
import { createSession } from "@/core/session";
import { putSession, spendQuota, storeShared } from "@/core/store";

export async function POST(req: Request) {
  if (!llmConfigured()) return NextResponse.json({ error: "Live mode needs a Groq key on the server. Use the demo instead." }, { status: 503 });
  if (process.env.VERCEL && !storeShared()) return NextResponse.json({ error: "Live mode needs a shared store on this deployment. Use the demo instead." }, { status: 503 });
  if (!(await spendQuota(30))) return NextResponse.json({ error: "Today's live runs are used up. Use the demo instead." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const task = String(body.task ?? "").trim().slice(0, 300);
  if (!task) return NextResponse.json({ error: "Enter a task." }, { status: 400 });
  try {
    const { plan, contract } = await compilePlan(task);
    const s = createSession(task, plan, contract, Date.now());
    await putSession(s);
    return NextResponse.json({ id: s.id });
  } catch (e) {
    return NextResponse.json({ error: `Could not write the contract: ${(e as Error).message}` }, { status: 502 });
  }
}
