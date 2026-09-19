import { io } from "socket.io-client";
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wait = sleep;
let seq = 0;
const pending = new Map();
async function main() {
  const res = await fetch("http://127.0.0.1:9223/json");
  const ts = await res.json();
  const page = ts.filter((t) => t.type === "page").find((p) => p.url.includes("localhost"));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (m, p = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method: m, params: p })); });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result?.result?.value;
  const shot = async (n) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(`/tmp/trek-${n}.png`, Buffer.from(r.result.data, "base64"));
    console.log("shot", n);
  };
  await send("Page.enable"); await send("Runtime.enable");
  const key = (type, k, code, vk) => send("Input.dispatchKeyEvent", { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  const s = io("http://localhost:3000", { path: "/socket.io" });
  let snap = null;
  s.on("hall:state", (st) => { snap = st; });
  await new Promise((res) => s.on("connect", res));
  s.emit("hall:join", { name: "Watcher", color: "#ffffff", outfit: "suit", hairstyle: "swept" });
  await wait(1500);
  const me = () => {
    if (!snap) return null;
    const p = Object.values(snap.players).find((p) => p.name === "Racer");
    return p ? { x: p.x, z: p.z, f: p.facing } : null;
  };
  const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  async function face(target, label) {
    for (let i = 0; i < 10; i++) {
      const p = me();
      if (!p) break;
      const d = norm(target - p.f);
      if (Math.abs(d) < 0.15) break;
      // chase turn: D decreases facing, A increases
      const k = d > 0 ? ["a", "KeyA", 65] : ["d", "KeyD", 68];
      await key("keyDown", k[0], k[1], k[2]);
      await sleep(Math.min(2500, (Math.abs(d) / 2.6) * 1000 + 400));
      await key("keyUp", k[0], k[1], k[2]);
      await sleep(600);
    }
  }
  async function goto(tx, tz, label) {
    for (let i = 0; i < 22; i++) {
      const p = me();
      if (!p) break;
      const dx = tx - p.x, dz = tz - p.z;
      if (Math.hypot(dx, dz) < 1.5) { console.log(label, "reached", p.x.toFixed(1), p.z.toFixed(1)); return; }
      await face(Math.atan2(dx, dz), label);
      await key("keyDown", "w", "KeyW", 87);
      await sleep(2200);
      await key("keyUp", "w", "KeyW", 87);
      await sleep(500);
    }
    const p = me();
    console.log(label, "end", p ? p.x.toFixed(1) + "," + p.z.toFixed(1) : "missing");
  }
  await goto(-20, 9, "door-approach");
  await shot("door");
  await goto(-30, 10, "through-door");
  await shot("pit");
  await goto(-46, 7, "start-line");
  await shot("track");
  // face east back at the door (door interior check), then FP enclosure shot
  const p = me();
  if (p) { await face(Math.atan2(-23 - p.x, 10 - p.z), "door-face"); }
  await shot("door-inside");
  await ev(`document.querySelector('[aria-label=\"open menu\"]').click()`);
  await sleep(1500);
  await ev(`[...document.querySelectorAll('[role=\"menuitem\"]')].find(x=>x.textContent.includes('view')).click()`);
  await sleep(2500);
  await shot("fp-room2");
  s.disconnect();
  ws.close();
  console.log("DONE");
}
main().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
