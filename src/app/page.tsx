import Link from "next/link";
import { Demo } from "@/components/Demo";

export default function Home() {
  return (
    <main>
      <header className="hero">
        <div className="brand">Brek</div>
        <h1>Approve the plan. Brek holds your AI agent to it.</h1>
        <p>Your agent shows its plan, you approve it once, and code outside the model checks every action. You only hear about what breaks the plan.</p>
      </header>
      <section aria-label="Try Brek"><Demo /></section>
      <section className="how">
        <h2>Why plans, not prompts</h2>
        <div className="cols">
          <p><b>The AI proposes.</b> It turns the plan into a contract you can read in ten seconds, and explains anything that goes off plan.</p>
          <p><b>Code enforces.</b> A gateway checks each call against the contract. The rules live outside the model, so a forgotten instruction changes nothing.</p>
          <p><b>Stop means stop.</b> Stop revokes the agent&apos;s token at the gateway. For steps that can&apos;t be undone, the agent runs only while your thumb is down.</p>
        </div>
        <p className="limit">Brek only sees tools routed through its gateway. Keep broad credentials away from the agent. <Link href="/live">Run it with a live AI agent</Link></p>
      </section>
    </main>
  );
}
