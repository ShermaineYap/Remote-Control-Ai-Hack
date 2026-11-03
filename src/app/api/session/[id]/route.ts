import { NextResponse } from "next/server";
import { explainDeviation, llmConfigured, nextAction } from "@/core/llm";
import { approve, decide, gatewayCall, holdHeartbeat, holdRelease, Pending, releaseIfHeld, Session, stop } from "@/core/session";
import { getSession, spendQuota, updateSession } from "@/core/store";

type Ctx = { params: Promise<{ id: string }> };
const pub = (s: Session) => { const { agentToken, ...rest } = s; void agentToken; return rest; };
const MAX_STEPS = 25;

export async function GET(_: Request, { params }: Ctx) {
  const s = await getSession((await params).id);
  return s ? NextResponse.json(pub(s), { headers: { "cache-control": "no-store" } }) : NextResponse.json({ error: "Session not found." }, { status: 404 });
}

// One agent step per request, so no function stays open while waiting for a human.
async function tick(s: Session) {
  const now = Date.now();
  if (s.status !== "running") return;
  if (s.pending) {
    const r = releaseIfHeld(s, now);
    if (r) s.agentHistory.push({ result: r });
    return;
  }
  if (s.lastResolution) { s.agentHistory.push({ resolution: s.lastResolution.decision }); s.lastResolution = undefined; }
  if (s.agentCursor >= MAX_STEPS || !llmConfigured() || !(await spendQuota(400, "step"))) { s.status = "done"; return; }
  // A failed model call costs one tick. The browser polls again, so the run continues.
  const step = await nextAction(s.task, s.contract, s.agentHistory).catch(() => null);
  if (!step) return;
  s.agentCursor++;
  if (!step.call) { s.status = "done"; s.events.push({ at: now, kind: "done", text: step.say }); return; }
  const r = gatewayCall(s, s.agentToken, step.call, Date.now());
  s.agentHistory.push({ say: step.say, call: step.call, result: r });
  const held = s.pending as Pending | undefined; // set by gatewayCall above
  if (held?.kind === "deviation") {
    held.explanation = await explainDeviation(s.contract, step.call, held.reason).catch(() => undefined);
    await alertPhone(s);
  }
}

async function alertPhone(s: Session) {
  const { TELEGRAM_BOT_TOKEN: bot, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!bot || !chat || !s.pending) return;
  await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: `Brek held a call: ${s.pending.explanation ?? s.pending.reason}` }),
  }).catch(() => undefined);
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const out = await updateSession(id, async (s) => {
      const now = Date.now();
      switch (body.action) {
        case "approve": approve(s, now); break;
        case "stop": stop(s, now); break;
        case "allow": case "deny":
          if (s.pending) decide(s, s.pending.handle, body.action, now); break;
        case "hold": holdHeartbeat(s, now); break;
        case "release": holdRelease(s, now); break;
        case "tick": await tick(s); break;
        default: throw new Error("Unknown action");
      }
    });
    return out ? NextResponse.json(pub(out.session)) : NextResponse.json({ error: "Session not found." }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
