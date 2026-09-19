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
    fs.writeFileSync(`/tmp/walk-${n}.png`, Buffer.from(r.result.data, "base64"));
    console.log("shot", n);
  };
  await send("Page.enable"); await send("Runtime.enable");
  const key = (type, k, code, vk) => send("Input.dispatchKeyEvent", { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  const tapView = async () => {
    await ev(`document.querySelector('[aria-label=\"open menu\"]').click()`);
    await sleep(1500);
    await ev(`[...document.querySelectorAll('[role=\"menuitem\"]')].find(x=>x.textContent.includes('view')).click()`);
    await sleep(2000);
  };
  const s = io("http://localhost:3000", { path: "/socket.io" });
  let snap = null;
  s.on("hall:state", (st) => { snap = st; });
  await new Promise((res) => s.on("connect", res));
  s.emit("hall:join", { name: "Watcher", color: "#ffffff", outfit: "suit", hairstyle: "swept" });
  await wait(1500);
  const pos = () => {
    if (!snap) return "no-snap";
    const p = Object.values(snap.players).find((p) => p.name === "Racer");
    return p ? `${p.x.toFixed(1)},${p.z.toFixed(1)}` : "missing";
  };
  await tapView(); // -> follow (strafe mode)
  const legs: Array<[string, string, number, number]> = [
    ["s", "KeyS", 83, 3000], ["s", "KeyS", 83, 3000],
    ["a", "KeyA", 65, 4000], ["a", "KeyA", 65, 4000], ["a", "KeyA", 65, 4000],
  ];
  for (const [k, code, vk, ms] of legs) {
    await key("keyDown", k, code, vk);
    await sleep(ms);
    await key("keyUp", k, code, vk);
    await sleep(1200);
    console.log("pos:", pos());
  }
  await shot("room2");
  s.disconnect();
  ws.close();
  console.log("DONE");
}
main().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
