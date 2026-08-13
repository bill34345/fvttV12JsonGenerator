import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";

import { TERRAIN_CONFIGURATIONS } from "../src/catalog";

const assetRoot = resolve(import.meta.dir, "../assets/terrain");

describe("original terrain assets", () => {
  test("ships exactly the six WebP files referenced by the P0 catalog", async () => {
    const expected = Object.values(TERRAIN_CONFIGURATIONS)
      .flatMap(({ stages }) => stages.map(({ texture }) => texture.split("/").at(-1)!))
      .sort();
    const actual = (await readdir(assetRoot))
      .filter((name) => name.endsWith(".webp"))
      .sort();

    expect(actual).toEqual(expected);
  });

  test("every asset is a compact WebP with an alpha-capable VP8X header", async () => {
    for (const name of await readdir(assetRoot)) {
      if (!name.endsWith(".webp")) continue;
      const bytes = await readFile(resolve(assetRoot, name));
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(bytes.includes(Buffer.from("ALPH"))).toBe(true);
      expect(bytes.byteLength).toBeLessThan(1_000_000);
    }
  });

  test("ships six VP9 alpha WebM loops and three OGG Opus ambience files", async () => {
    const media = [
      ...await readdir(resolve(import.meta.dir, "../assets/terrain")),
      ...await readdir(resolve(import.meta.dir, "../assets/audio")),
    ];
    expect(media.filter((name) => name.endsWith(".webm"))).toHaveLength(6);
    expect(media.filter((name) => name.endsWith(".ogg"))).toHaveLength(3);
  });

  test("each WebM decodes to a non-opaque alpha plane through libvpx", async () => {
    if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a platform binary");
    const webm = (await readdir(assetRoot)).filter((name) => name.endsWith(".webm"));
    for (const name of webm) {
      const alpha = await decodeAlpha(resolve(assetRoot, name), ffmpegPath);
      expect(alpha.byteLength).toBe(512 * 512);
      let minimum = 255;
      let maximum = 0;
      for (const value of alpha) {
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
      expect(minimum).toBe(0);
      expect(maximum).toBe(255);
    }
  });

  test("reports the locked video and audio media parameters", async () => {
    if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a platform binary");

    for (const name of (await readdir(assetRoot)).filter((entry) => entry.endsWith(".webm"))) {
      const report = await probeMedia(resolve(assetRoot, name), ffmpegPath, [
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
      ]);
      expect(report).toMatch(/Duration:\s+00:00:04\.00/);
      expect(report).toMatch(/Video:\s+vp9\b/i);
      expect(report).toMatch(/512x512/);
      expect(report).toMatch(/24\s+fps/);
      expect(report).toMatch(/ALPHA_MODE\s*:\s*1/i);
      expect(report).not.toMatch(/\n\s*Stream #\d+:\d+.*Audio:/i);
    }

    for (const name of (await readdir(resolve(import.meta.dir, "../assets/audio"))).filter((entry) => entry.endsWith(".ogg"))) {
      const report = await probeMedia(resolve(import.meta.dir, "../assets/audio", name), ffmpegPath, [
        "-map",
        "0:a:0",
        "-t",
        "0.1",
      ]);
      expect(report).toMatch(/Duration:\s+00:00:(?:19|20)\./);
      expect(report).toMatch(/Audio:\s+opus,\s*48000 Hz,\s*mono/i);
    }
  });
});

const decodeAlpha = (path: string, executable: string): Promise<Uint8Array> =>
  new Promise((resolvePromise, reject) => {
    const process = spawn(executable, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-c:v",
      "libvpx-vp9",
      "-i",
      path,
      "-vf",
      "alphaextract",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "pipe:1",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    process.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    process.on("error", reject);
    process.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`alpha decode failed for ${path}: ${Buffer.concat(errors).toString()}`));
        return;
      }
      resolvePromise(new Uint8Array(Buffer.concat(chunks)));
    });
  });

const probeMedia = (
  path: string,
  executable: string,
  outputOptions: string[],
): Promise<string> =>
  new Promise((resolvePromise, reject) => {
    const process = spawn(
      executable,
      ["-hide_banner", "-i", path, ...outputOptions, "-f", "null", "-"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const errors: Buffer[] = [];
    process.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    process.on("error", reject);
    process.on("close", (code) => {
      const report = Buffer.concat(errors).toString();
      if (code !== 0) {
        reject(new Error(`media probe failed for ${path}: ${report}`));
        return;
      }
      resolvePromise(report);
    });
  });
