// Usage: npm run record -- https://your-deployment.vercel.app
// Saves real model output for the browser demo, but only if the scripted demo still works with that contract.
import { writeFileSync } from "node:fs";
import { hardenContract, checkCall } from "../src/core/contract";
import { DEMO_SCRIPT } from "../src/core/demo-data";

const base = process.argv[2];
if (!base) throw new Error("Pass the deployment URL.");
const res = await fetch(`${base}/api/record`, { method: "POST" });
const data = await res.json();
if (!res.ok) throw new Error(data.error);
const c = hardenContract(data.contract);
const results = DEMO_SCRIPT.flatMap((s) => (s.call ? [[s.call.tool, checkCall(c, s.call).verdict] as const] : []));
console.log(JSON.stringify(data, null, 2)); console.log(results);
const ok = results.filter(([t]) => t === "volume.delete").every(([, v]) => v === "hold") && results.filter(([t]) => t === "db.migrate").every(([, v]) => v === "needs-hold") && results.filter(([t]) => t !== "volume.delete" && t !== "db.migrate").every(([, v]) => v === "allow");
if (!ok) { console.log("Contract does not fit the demo script. Not saved."); process.exit(1); }
writeFileSync("src/core/recorded.json", JSON.stringify(data, null, 2) + "\n");
console.log("Saved.");
