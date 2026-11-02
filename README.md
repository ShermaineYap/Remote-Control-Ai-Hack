# Brek

Approve your AI agent's plan once. Brek holds it to that plan from outside the model, and Stop really cuts its access.

*Brek* is the Malay spelling of "brake". Built for the Remote Control AI hackathon.

## The problem

Agents now hold real credentials, and the usual safeguard is a stream of permission prompts. Anthropic reports that users approve 97% of them. In one reported incident an agent deleted a company's production database and backups in nine seconds, using a token it found in an unrelated file.

## How it works

1. The agent submits a plan.
2. AI writes a short contract: what it will touch, what it won't, and what can't be undone.
3. You approve once on your phone.
4. Every tool call passes through the gateway. Calls inside the contract run silently.
5. A call outside the contract is held, and AI explains it in one sentence. You choose Deny or Allow once.
6. For irreversible steps, the agent runs only while your thumb is down. Lift, or lose signal, and those calls freeze.
7. Stop revokes the agent's token at the gateway.

**The AI proposes. Code enforces.** The model writes the contract and explanations. The allow or block decision is plain code (`src/core/contract.ts`) with no LLM in the path, so the rules can't be lost when an agent's context is compacted. Contracts from the model are hardened too: destructive rights can never land in the silent list.

## Run it

```bash
npm install
npm run dev     # http://localhost:3000, the demo needs no keys
npm test        # unit tests
npm run study   # the measured study below
```

Live mode (`/live`) uses a real LLM agent. Copy `.env.example` to `.env.local` and add a free [Groq](https://console.groq.com) key. Deployed on Vercel it also needs an Upstash Redis database, because serverless functions don't share memory. Telegram alerts are optional.

To replace the demo's hand-written text with real model output: `npm run record -- https://your-deployment`.

## Measured study

`npm run study` runs 30 self-written scenarios through the real gateway. Results are in [study/RESULTS.md](study/RESULTS.md). This shows Brek behaves as designed. It does not prove real-world safety.

## Limits

- Only tools routed through the gateway are covered. Keep broad credentials out of the agent's reach.
- It runs on a fake sandbox with seven tools. No real infrastructure adapter or MCP adapter exists yet.
- The SQL check is a conservative keyword classifier, not a full parser. It fails closed.
- A human can still choose Allow once on something unwise.

## Built with

Next.js, React, TypeScript, Vitest, Groq (`openai/gpt-oss-120b`), Upstash Redis, Telegram Bot API, Overpass fonts via Fontsource, qrcode.react. Code was written with AI assistance from Claude. All code was written during the event.

## Sources

- [Anthropic: auto mode default in Claude Code](https://claude.com/blog/auto-mode-default-in-claude-code) (vendor-reported)
- [Security Magazine: company database deleted by AI agent](https://www.securitymagazine.com/articles/102278-company-database-deleted-by-ai-agent-what-security-leaders-need-to-know)

MIT licence.
