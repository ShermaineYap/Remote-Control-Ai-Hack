import { NextResponse } from "next/server";
import { DEMO_TASK } from "@/core/demo-data";
import { compilePlan, explainDeviation, llmConfigured } from "@/core/llm";
import { spendQuota } from "@/core/store";

// Returns real model output for the demo task, so the browser demo can replay it without a key.
export async function POST() {
  if (!llmConfigured()) return NextResponse.json({ error: "No Groq key on the server." }, { status: 503 });
  if (!(await spendQuota(30))) return NextResponse.json({ error: "Daily limit reached." }, { status: 429 });
  try {
    const { plan, contract } = await compilePlan(DEMO_TASK);
    const call = { tool: "volume.delete", args: { env: "production", volume: "rentals-data" } };
    const explanation = await explainDeviation(contract, call, "volume.delete is a destructive action on production, which the approved plan does not cover.");
    return NextResponse.json({ source: "recorded", model: process.env.GROQ_MODEL || "openai/gpt-oss-120b", plan, contract, explanation });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
