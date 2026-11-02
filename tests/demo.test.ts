import { describe, it, expect } from "vitest";
import { scriptedTick } from "@/core/agent";
import { DEMO_TASK, demoContract } from "@/core/demo-data";
import { approve, createSession, decide, holdHeartbeat } from "@/core/session";

describe("demo run", () => {
  it("goes end to end with a human deny and a thumb", () => {
    const s = createSession(DEMO_TASK, "p", demoContract(), 0, "d");
    approve(s, 0);
    let t = 1;
    for (; t < 200 && s.status === "running"; t++) {
      if (s.pending?.kind === "deviation") { expect(s.pending.call.tool).toBe("volume.delete"); decide(s, s.pending.handle, "deny", t); }
      if (s.pending?.kind === "irreversible") holdHeartbeat(s, t);
      scriptedTick(s, t);
    }
    expect(s.status).toBe("done");
    expect(s.sandbox.volumes.production).toBe(true);
    expect(s.sandbox.db.production.bookings).toBe(58312);
    expect(s.sandbox.db.staging.migrated).toHaveLength(3);
    expect(s.silentCalls).toBeGreaterThanOrEqual(10);
  });
});
