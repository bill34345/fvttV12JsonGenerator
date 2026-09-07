import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ffmpegPath from "ffmpeg-static";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "scratch", "frost-field-v1");
const assets = resolve(root, "assets", "terrain");
const stills = resolve(output, "stills");
const videos = resolve(output, "videos");
const temporary = resolve(output, ".generated-frames");
const chrome = process.env.BATTLEFIELD_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const previewBackground = process.env.BATTLEFIELD_FROST_PREVIEW_MAP;
const html = pathToFileURL(resolve(import.meta.dirname, "generate-frost-assets.html")).href;
const port = 10900 + Math.floor(Math.random() * 500);
const previewLayouts = [
  "stage1-single",
  "stage1-3x3",
  "stage2-single",
  "stage2-1x3",
  "stage2-3x3",
  "mixed-stage",
  "adjacent-draws",
  "l-shape",
  "center-hole",
  "dark-map-token",
  "light-map-token",
];
const videoLayouts = ["stage1-3x3", "stage2-3x3", "mixed-stage"];

if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a platform binary");

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const runProcess = (command, args) => new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) resolvePromise();
    else reject(new Error(`${command} exited with ${code}: ${Buffer.concat(stderr).toString()}`));
  });
});

await mkdir(stills, { recursive: true });
await mkdir(videos, { recursive: true });
await mkdir(assets, { recursive: true });
await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
await mkdir(temporary, { recursive: true });

const profile = await mkdtemp(resolve(tmpdir(), "battlefield-frost-assets-chrome-"));
const browser = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--allow-file-access-from-files",
  "--no-first-run",
  "--hide-scrollbars",
  "--window-size=1280,1024",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  html,
], { stdio: "ignore", windowsHide: true });

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
    const result = await command("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Browser evaluation failed");
    return result.result?.value;
  };
  const capture = async (path, width, height) => {
    const screenshot = await command("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(screenshot.data, "base64"));
  };

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 1024,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command("Emulation.setDefaultBackgroundColorOverride", {
    color: { r: 0, g: 0, b: 0, a: 0 },
  });

  let title = "";
  for (let attempt = 0; attempt < 120; attempt += 1) {
    title = await evaluate("document.title");
    if (title === "FROST_GENERATOR_READY") break;
    await sleep(250);
  }
  if (title !== "FROST_GENERATOR_READY") throw new Error(`Frost generator did not initialize (${title})`);

  await evaluate("frostGenerator.renderFilm()");
  const filmPng = resolve(temporary, "frost-film-v1.png");
  await capture(filmPng, 1024, 1024);
  await runProcess(ffmpegPath, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", filmPng,
    "-c:v", "libwebp", "-lossless", "1", "-compression_level", "6",
    resolve(assets, "frost-film-v1.webp"),
  ]);

  const mistFrames = resolve(temporary, "mist");
  await mkdir(mistFrames, { recursive: true });
  for (let frame = 0; frame < 96; frame += 1) {
    await evaluate(`frostGenerator.renderMistFrame(${frame})`);
    await capture(resolve(mistFrames, `mist-${String(frame).padStart(4, "0")}.png`), 1024, 1024);
    if (frame % 24 === 23) console.log(`mist frames: ${frame + 1}/96`);
  }
  await runProcess(ffmpegPath, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-framerate", "24", "-i", resolve(mistFrames, "mist-%04d.png"),
    "-frames:v", "96", "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "18",
    "-deadline", "good", "-cpu-used", "2", "-row-mt", "1", "-g", "96", "-lag-in-frames", "0",
    "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-metadata:s:v:0", "alpha_mode=1",
    resolve(assets, "frost-mist-v1.webm"),
  ]);

  const finalMedia = await evaluate(`frostGenerator.loadFinalMedia(${JSON.stringify(
    pathToFileURL(resolve(assets, "frost-film-v1.webp")).href,
  )}, ${JSON.stringify(pathToFileURL(resolve(assets, "frost-mist-v1.webm")).href)})`);
  if (!finalMedia?.film || finalMedia.mistVideos !== 4) {
    throw new Error(`Final Frost media did not load for preview: ${JSON.stringify(finalMedia)}`);
  }
  if (previewBackground) {
    const loadedBackground = await evaluate(`frostGenerator.loadPreviewBackground(${JSON.stringify(
      pathToFileURL(resolve(previewBackground)).href,
    )})`);
    if (!loadedBackground?.width || !loadedBackground?.height) {
      throw new Error(`Frost preview background did not load: ${JSON.stringify(loadedBackground)}`);
    }
  }

  for (const layout of previewLayouts) {
    await evaluate(`frostGenerator.renderFinalPreview(${JSON.stringify(layout)}, 29)`);
    await capture(resolve(stills, `${layout}.png`), 1280, 720);
  }

  for (const layout of videoLayouts) {
    const frameDirectory = resolve(temporary, `preview-${layout}`);
    await mkdir(frameDirectory, { recursive: true });
    for (let frame = 0; frame < 96; frame += 1) {
      await evaluate(`frostGenerator.renderFinalPreview(${JSON.stringify(layout)}, ${frame})`);
      await capture(resolve(frameDirectory, `preview-${String(frame).padStart(4, "0")}.png`), 1280, 720);
    }
    await runProcess(ffmpegPath, [
      "-y", "-hide_banner", "-loglevel", "error",
      "-framerate", "24", "-i", resolve(frameDirectory, "preview-%04d.png"),
      "-frames:v", "96", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      resolve(videos, `${layout}-4s.mp4`),
    ]);
    console.log(`preview video: ${layout}`);
  }

  await runProcess(ffmpegPath, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-stream_loop", "-1", "-i", resolve(videos, "stage2-3x3-4s.mp4"),
    "-t", "9", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    resolve(videos, "stage2-3x3-loop-9s.mp4"),
  ]);

  await writeFile(resolve(output, "manifest.json"), JSON.stringify({
    generatedBy: "scripts/generate-frost-assets.mjs",
    deterministic: true,
    previewSource: "final-encoded-media",
    film: {
      file: "assets/terrain/frost-film-v1.webp",
      width: 1024,
      height: 1024,
      seamless: true,
      transparent: true,
    },
    mist: {
      file: "assets/terrain/frost-mist-v1.webm",
      width: 1024,
      height: 1024,
      layout: "2x2",
      variants: 4,
      fps: 24,
      frames: 96,
      durationSeconds: 4,
      alpha: true,
    },
    stills: previewLayouts.map((name) => `stills/${name}.png`),
    videos: [
      "videos/stage1-3x3-4s.mp4",
      "videos/stage2-3x3-4s.mp4",
      "videos/mixed-stage-4s.mp4",
      "videos/stage2-3x3-loop-9s.mp4",
    ],
  }, null, 2));

  console.log(JSON.stringify({ output, assets: [
    resolve(assets, "frost-film-v1.webp"),
    resolve(assets, "frost-mist-v1.webm"),
  ] }, null, 2));
} finally {
  socket?.close();
  browser.kill();
  await sleep(750);
  await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
  await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}
