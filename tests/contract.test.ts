import { describe, it, expect } from "vitest";
import { checkCall, classifySql, globMatch, hardenContract, normalisePath, Contract } from "@/core/contract";
import { approve, createSession, decide, gatewayCall, holdHeartbeat, holdRelease, releaseIfHeld, stop, HOLD_LEASE_MS } from "@/core/session";

const contract: Contract = {
  goal: "g", summary: "s", touches: [], offLimits: [], maxCalls: 10, expiresInMinutes: 30,
  allow: [{ tool: "files.read", path: "migrations/**", maxEffect: "read" }, { tool: "db.query", env: "staging", maxEffect: "read" }],
  irreversible: [{ tool: "db.migrate", env: "staging", maxEffect: "write" }],
};
const v = (tool: string, args: object) => checkCall(contract, { tool, args: args as Record<string, unknown> }).verdict;

describe("checkCall", () => {
  it("allows calls inside the plan", () => { expect(v("files.read", { path: "migrations/007.sql" })).toBe("allow"); expect(v("db.query", { env: "staging", sql: "select 1" })).toBe("allow"); });
  it("holds other environments, aliases included", () => { expect(v("db.query", { env: "production", sql: "select 1" })).toBe("hold"); expect(v("db.query", { env: " PROD ", sql: "select 1" })).toBe("hold"); });
  it("holds path escapes", () => { expect(v("files.read", { path: "migrations/../.env" })).toBe("hold"); expect(v("files.read", { path: "migrations/%2e%2e/.env" })).toBe("hold"); });
  it("holds destructive SQL hidden after a read", () => { expect(v("db.query", { env: "staging", sql: "SELECT 1; DROP TABLE x" })).toBe("hold"); });
  it("sends irreversible rules to the human", () => { expect(v("db.migrate", { env: "staging", name: "m" })).toBe("needs-hold"); });
  it("holds unknown tools and missing env", () => { expect(v("shell.exec", {})).toBe("hold"); expect(v("db.query", { sql: "select 1" })).toBe("hold"); });
});

describe("helpers", () => {
  it("classifies SQL and fails closed", () => {
    expect(classifySql("select * from a")).toBe("read");
    expect(classifySql("update a set b=1 where c=2")).toBe("write");
    expect(classifySql("delete from a")).toBe("destructive");
    expect(classifySql("sel/**/ect 1")).toBe("destructive");
    expect(classifySql("SELECT 'DROP TABLE x'")).toBe("read");
    expect(classifySql("")).toBe("destructive");
  });
  it("matches globs", () => { expect(globMatch("a/**", "a/b/c.txt")).toBe(true); expect(globMatch("a/*", "a/b/c.txt")).toBe(false); expect(globMatch("a/**", "b/a")).toBe(false); });
  it("rejects bad paths", () => { expect(normalisePath("/etc/passwd")).toBeNull(); expect(normalisePath("a\\b")).toBeNull(); expect(normalisePath("./a/b")).toBe("a/b"); });
  it("hardening cannot be talked into silent destruction", () => {
    const c = hardenContract({ allow: [{ tool: "volume.delete", env: "production" }, { tool: "http.post" }, { tool: "evil" }, { tool: "db.query", sql: "x" }], maxCalls: 99999 });
    expect(c.allow).toEqual([]);
    expect(c.irreversible.map((r) => r.tool)).toEqual(["volume.delete"]);
    expect(c.maxCalls).toBe(200);
  });
});

describe("hardening real model mistakes", () => {
  it("splits comma-joined paths", () => {
    const c = hardenContract({ allow: [{ tool: "files.read", path: "migrations/*,notes/*" }] });
    expect(c.allow.map((r) => r.path)).toEqual(["migrations/*", "notes/*"]);
  });
  it("moves migrations out of the silent list", () => {
    const c = hardenContract({ allow: [{ tool: "db.migrate", env: "staging", maxEffect: "write" }] });
    expect(c.allow).toEqual([]);
    expect(c.irreversible[0].tool).toBe("db.migrate");
  });
});

describe("gateway", () => {
  const go = () => { const s = createSession("t", "p", contract, 0, "id"); return s; };
  const read = { tool: "files.read", args: { path: "migrations/a" } };
  it("refuses before approval and with a wrong token", () => {
    const s = go(); expect(gatewayCall(s, s.agentToken, read, 1).status).toBe("refused");
    approve(s, 2); expect(gatewayCall(s, "stolen", read, 3).status).toBe("refused");
  });
  it("holds a deviation until a human decides, once", () => {
    const s = go(); approve(s, 0);
    const r = gatewayCall(s, s.agentToken, { tool: "volume.delete", args: { env: "production" } }, 1);
    expect(r.status).toBe("held");
    expect(s.sandbox.volumes.production).toBe(true);
    expect(gatewayCall(s, s.agentToken, read, 2).status).toBe("refused");
    expect(decide(s, (r as { handle: string }).handle, "deny", 3).status).toBe("denied");
    expect(s.sandbox.volumes.production).toBe(true);
    expect(decide(s, (r as { handle: string }).handle, "allow", 4).status).toBe("refused");
  });
  it("runs nothing after Stop", () => {
    const s = go(); approve(s, 0); stop(s, 1);
    expect(gatewayCall(s, s.agentToken, read, 2).status).toBe("refused");
    expect(s.callCount).toBe(0);
  });
  it("freezes irreversible calls when the thumb lifts or the lease lapses", () => {
    const s = go(); approve(s, 0);
    const mig = { tool: "db.migrate", args: { env: "staging", name: "m" } };
    expect(gatewayCall(s, s.agentToken, mig, 1).status).toBe("held");
    holdHeartbeat(s, 2);
    expect(releaseIfHeld(s, 3)?.status).toBe("ok");
    expect(gatewayCall(s, s.agentToken, mig, 4).status).toBe("ok");
    holdRelease(s, 5);
    expect(gatewayCall(s, s.agentToken, mig, 6).status).toBe("held");
    const t = createSession("t", "p", contract, 0, "x"); approve(t, 0); holdHeartbeat(t, 1);
    expect(gatewayCall(t, t.agentToken, mig, 1 + HOLD_LEASE_MS + 1).status).toBe("held");
  });
  it("enforces the call budget", () => {
    const s = createSession("t", "p", { ...contract, maxCalls: 1 }, 0, "b"); approve(s, 0);
    expect(gatewayCall(s, s.agentToken, read, 1).status).toBe("ok");
    expect(gatewayCall(s, s.agentToken, read, 2).status).toBe("refused");
    expect(s.tokenRevoked).toBe(true);
  });
});
