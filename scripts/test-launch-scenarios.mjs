/**
 * Launch reliability tests — run with: node scripts/test-launch-scenarios.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(new URL("..", import.meta.url)));
const WEB = "http://127.0.0.1:3000";
const API = "http://127.0.0.1:8000";

async function fetchStatus(url, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    return { ok: res.ok, status: res.status, ms: Date.now() - start, url };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - start, url, error: String(e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

async function getLayoutChunkUrl() {
  const res = await fetch(WEB, { redirect: "follow" });
  const html = await res.text();
  const m = html.match(/\/_next\/static\/chunks\/app\/layout\.js[^"']*/);
  return m ? `${WEB}${m[0]}` : null;
}

function runBat(relPath) {
  return new Promise((resolve) => {
    const full = path.join(ROOT, relPath);
    const child = spawn("cmd.exe", ["/c", full], { cwd: ROOT, windowsHide: true });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

function portsListening() {
  return new Promise((resolve) => {
    const child = spawn(
      "cmd.exe",
      ["/c", 'netstat -ano | findstr "LISTENING" | findstr ":3000 :3001 :8000"'],
      { windowsHide: true }
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", () => resolve(out.trim()));
  });
}

async function scenario(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    console.log(`PASS  ${name} (${Date.now() - t0}ms)`, detail ? `— ${detail}` : "");
    return { name, pass: true, ms: Date.now() - t0, detail };
  } catch (e) {
    console.log(`FAIL  ${name} (${Date.now() - t0}ms) — ${e.message}`);
    return { name, pass: false, ms: Date.now() - t0, error: e.message };
  }
}

const results = [];

results.push(
  await scenario("kill-web-ports.bat runs", async () => {
    const code = await runBat("scripts/kill-web-ports.bat");
    if (code !== 0) throw new Error(`exit ${code}`);
    await delay(1500);
    const ports = await portsListening();
    if (ports.includes(":3000") || ports.includes(":3001"))
      throw new Error(`ports still listening:\n${ports}`);
    return "3000/3001 cleared";
  })
);

let devProc;
results.push(
  await scenario("npm run dev starts on 3000 only", async () => {
    devProc = spawn("npm.cmd", ["run", "dev"], { cwd: ROOT, stdio: "pipe" });
    let out = "";
    devProc.stdout.on("data", (d) => (out += d));
    devProc.stderr.on("data", (d) => (out += d));
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (out.includes("Ready")) {
        ready = true;
        break;
      }
      await delay(500);
    }
    if (!ready) throw new Error(`Next.js Ready not seen in 30s\n${out.slice(-400)}`);
    await delay(1000);
    const ports = await portsListening();
    if (!ports.includes(":3000")) throw new Error("3000 not listening");
    if (ports.includes(":3001")) throw new Error("3001 also listening — duplicate server risk");
    return "single server on 3000";
  })
);

results.push(
  await scenario("homepage HTTP 200", async () => {
    const r = await fetchStatus(WEB, 90000);
    if (!r.ok) throw new Error(`status ${r.status} ${r.error || ""}`);
    return `${r.status} in ${r.ms}ms`;
  })
);

results.push(
  await scenario("app/layout.js chunk HTTP 200", async () => {
    const chunkUrl = await getLayoutChunkUrl();
    if (!chunkUrl) throw new Error("layout chunk URL not in HTML");
    const r = await fetchStatus(chunkUrl, 90000);
    if (!r.ok) throw new Error(`status ${r.status} ${r.error || ""}`);
    return `${r.status} in ${r.ms}ms`;
  })
);

results.push(
  await scenario("second npm run dev fails on busy 3000", async () => {
    const second = spawn("npm.cmd", ["run", "dev"], { cwd: ROOT, stdio: "pipe" });
    let out = "";
    second.stdout.on("data", (d) => (out += d));
    second.stderr.on("data", (d) => (out += d));
    const code = await new Promise((res) => second.on("close", res));
    await delay(500);
    const ports = await portsListening();
    if (ports.includes(":3001")) throw new Error("second server escaped to 3001");
    if (code === 0 && out.includes("Ready")) throw new Error("second server started successfully");
    return `exit ${code}, no 3001`;
  })
);

{
  const r = await scenario("API health (optional)", async () => {
    const health = await fetchStatus(`${API}/health`, 5000);
    if (health.ok) return `${health.status} in ${health.ms}ms`;
    const docs = await fetchStatus(`${API}/docs`, 5000);
    if (docs.ok) return `/docs ${docs.status}`;
    return "skipped — API not running";
  });
  if (r.detail === "skipped — API not running") r.pass = true;
  results.push(r);
}

if (devProc) devProc.kill("SIGTERM");
await runBat("scripts/kill-web-ports.bat");

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);
console.log(`\n${passed}/${results.length} passed`);
if (failed.length) {
  console.log("Failures:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
