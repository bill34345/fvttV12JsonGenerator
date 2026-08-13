import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ffmpegPath from "ffmpeg-static";

const root = resolve(import.meta.dirname, "..");
if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a platform binary");
const html = pathToFileURL(resolve(import.meta.dirname, "generate-media.html")).href;
const chrome = process.env.BATTLEFIELD_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = 9229 + Math.floor(Math.random() * 1000);
const profile = await mkdtemp(resolve(tmpdir(), "battlefield-painter-chrome-"));
const browser = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--allow-file-access-from-files",
  "--autoplay-policy=no-user-gesture-required",
  "--no-first-run",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  html,
], { stdio: "ignore", windowsHide: true });

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
let socket;
try {
  let page;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      page = pages.find((candidate) => candidate.url.startsWith("file:"));
      if (page) break;
    } catch {
      // Chrome is still starting.
    }
    await sleep(250);
  }
  if (!page) throw new Error("Chrome DevTools page did not start");

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolvePromise, reject) => {
    socket.addEventListener("open", resolvePromise, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message));
    else callback.resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolvePromise, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve: resolvePromise, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return result.result?.value;
  };

  let state = "";
  for (let attempt = 0; attempt < 240; attempt += 1) {
    state = await evaluate("document.title");
    if (state === "MEDIA_READY" || state === "MEDIA_ERROR") break;
    await sleep(500);
  }
  if (state !== "MEDIA_READY") {
    const status = await evaluate("document.querySelector('#status')?.textContent || ''");
    throw new Error(`Media generator did not finish (title=${state}, status=${status})`);
  }
  const encoded = await evaluate("document.querySelector('#payload')?.textContent || ''");
  const payload = JSON.parse(encoded);
  const output = resolve(root, "assets");
  const temporary = await mkdtemp(resolve(tmpdir(), "battlefield-painter-media-"));
  try {
    for (const [name, base64] of Object.entries(payload)) {
      if (name.startsWith("audio-") && name.endsWith(".webm")) {
        const source = resolve(temporary, name);
        const target = resolve(temporary, `${name.slice(6, -5)}.ogg`);
        await writeFile(source, Buffer.from(base64, "base64"));
        const conversion = spawn(ffmpegPath, [
          "-y", "-hide_banner", "-loglevel", "error", "-i", source,
          "-vn", "-c:a", "libopus", "-b:a", "64k", "-ac", "1", "-ar", "48000", "-f", "ogg", target,
        ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
        const stderr = [];
        conversion.stderr.on("data", (chunk) => stderr.push(chunk));
        const exitCode = await new Promise((resolvePromise) => conversion.on("close", resolvePromise));
        if (exitCode !== 0) throw new Error(`ffmpeg audio conversion failed: ${Buffer.concat(stderr).toString()}`);
        await mkdir(resolve(output, "audio"), { recursive: true });
        await writeFile(resolve(output, "audio", `${name.slice(6, -5)}.ogg`), await readFile(target));
      } else if (name.endsWith(".webm")) {
        const source = resolve(temporary, name);
        const alphaMask = resolve(output, "terrain", `${name.slice(0, -5)}.webp`);
        const target = resolve(temporary, `${name.slice(0, -5)}.final.webm`);
        await writeFile(source, Buffer.from(base64, "base64"));
        const conversion = spawn(ffmpegPath, [
          "-y", "-hide_banner", "-loglevel", "error", "-stream_loop", "-1", "-i", source,
          "-loop", "1", "-i", alphaMask,
          "-filter_complex", "[0:v]format=yuv420p[v];[1:v]format=yuva420p,alphaextract,scale=512:512[mask];[v][mask]alphamerge,format=yuva420p[out]",
          "-map", "[out]", "-t", "4", "-r", "24", "-c:v", "libvpx-vp9", "-b:v", "1200k",
          "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-an",
          "-metadata:s:v:0", "alpha_mode=1", "-f", "webm", target,
        ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
        const stderr = [];
        conversion.stderr.on("data", (chunk) => stderr.push(chunk));
        const exitCode = await new Promise((resolvePromise) => conversion.on("close", resolvePromise));
        if (exitCode !== 0) throw new Error(`ffmpeg video conversion failed: ${Buffer.concat(stderr).toString()}`);
        await mkdir(resolve(output, "terrain"), { recursive: true });
        await writeFile(resolve(output, "terrain", name), await readFile(target));
      } else {
        await mkdir(resolve(output, "terrain"), { recursive: true });
        await writeFile(resolve(output, "terrain", name), Buffer.from(base64, "base64"));
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ generated: Object.keys(payload), root: output }, null, 2));
} finally {
  socket?.close();
  browser.kill();
  await sleep(1000);
  await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}
