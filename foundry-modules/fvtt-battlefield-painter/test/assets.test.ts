import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";

import { TERRAIN_CONFIGURATIONS } from "../src/catalog";

const assetRoot = resolve(import.meta.dir, "../assets/terrain");
const expectedWebP = ["brambles.webp", "fire.webp", "frost.webp"];
const expectedEffectWebP = ["frost-film-v1.webp"];
const expectedWebM = ["brambles.webm", "fire.webm", "frost.webm"];
const expectedFieldWebM = ["fire-stage-i.webm", "fire-stage-ii.webm"];
const expectedFrostFieldWebM = ["frost-mist-v1.webm"];
const expectedAllWebM = [
  ...expectedWebM,
  ...expectedFieldWebM,
  ...expectedFrostFieldWebM,
].sort();

describe("original terrain assets", () => {
  test("ships the three canonical P0 WebPs plus the Frost P2 film", async () => {
    const expected = Object.values(TERRAIN_CONFIGURATIONS)
      .flatMap(({ stages }) => stages.map(({ texture }) => texture.split("/").at(-1)!))
      .filter((name, index, names) => names.indexOf(name) === index)
      .sort();
    const actual = (await readdir(assetRoot))
      .filter((name) => name.endsWith(".webp"))
      .sort();

    expect(expected).toEqual(expectedWebP);
    expect(actual).toEqual([...expectedWebP, ...expectedEffectWebP].sort());
  });

  test("ships a transparent 1024x1024 seamless Frost film", async () => {
    if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a platform binary");
    const path = resolve(assetRoot, "frost-film-v1.webp");
    const bytes = await readFile(path);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    const alpha = await decodeAlpha(path, ffmpegPath);
    expect(alpha.byteLength).toBe(1024 * 1024);
    const { minimum, maximum } = alphaRange(alpha);
    expect(minimum).toBeLessThan(maximum);
    expect(maximum).toBeLessThan(255);
  });

  test("every WebP is 512x512, alpha-capable, and reaches all four edges", async () => {
    if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a platform binary");

    for (const name of expectedWebP) {
      const bytes = await readFile(resolve(assetRoot, name));
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(
        bytes.includes(Buffer.from("ALPH")) ||
          bytes.includes(Buffer.from("VP8X")) ||
          bytes.includes(Buffer.from("VP8L")),
      ).toBe(true);
      expect(bytes.byteLength).toBeLessThan(1_000_000);

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
      expect(edgeHasNonTransparent(alpha, "top")).toBe(true);
      expect(edgeHasNonTransparent(alpha, "right")).toBe(true);
      expect(edgeHasNonTransparent(alpha, "bottom")).toBe(true);
      expect(edgeHasNonTransparent(alpha, "left")).toBe(true);
    }
  });

  test("ships canonical loops plus the two fire-field samples and no retired audio assets", async () => {
    const media = await readdir(resolve(import.meta.dir, "../assets/terrain"));
    expect(media.filter((name) => name.endsWith(".webm")).sort()).toEqual(expectedAllWebM);
    await expect(access(resolve(import.meta.dir, "../assets/audio"))).rejects.toThrow();
  });

  test("each WebM decodes to a non-opaque alpha plane through libvpx", async () => {
    if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a platform binary");
    for (const name of expectedWebM) {
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

  test("reports the locked video media parameters", async () => {
    if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a platform binary");

    for (const name of expectedWebM) {
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

  });

  test("reports the two Style B/I and Style A/II field samples", async () => {
    if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a platform binary");
    for (const name of expectedFieldWebM) {
      const report = await probeMedia(resolve(assetRoot, name), ffmpegPath, [
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
      ]);
      expect(report).toMatch(/Duration:\s+00:00:04\.00/);
      expect(report).toMatch(/Video:\s+vp9\b/i);
      expect(report).toMatch(/768x768/);
      expect(report).toMatch(/24\s+fps/);
      expect(report).toMatch(/ALPHA_MODE\s*:\s*1/i);
      expect(report).toMatch(/yuv420p/i);
      expect(report).not.toMatch(/\n\s*Stream #\d+:\d+.*Audio:/i);
    }
  });

  test("reports the transparent 2x2 Frost mist field", async () => {
    if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a platform binary");
    const path = resolve(assetRoot, "frost-mist-v1.webm");
    const alpha = await decodeAlpha(path, ffmpegPath);
    expect(alpha.byteLength).toBe(1024 * 1024);
    const { minimum, maximum } = alphaRange(alpha);
    expect(minimum).toBe(0);
    expect(maximum).toBeGreaterThan(0);
    expect(maximum).toBeLessThan(255);
    const report = await probeMedia(path, ffmpegPath, [
      "-map",
      "0:v:0",
      "-frames:v",
      "1",
    ]);
    expect(report).toMatch(/Duration:\s+00:00:04\.00/);
    expect(report).toMatch(/Video:\s+vp9\b/i);
    expect(report).toMatch(/1024x1024/);
    expect(report).toMatch(/24\s+fps/);
    expect(report).toMatch(/ALPHA_MODE\s*:\s*1/i);
    expect(report).not.toMatch(/\n\s*Stream #\d+:\d+.*Audio:/i);
  });
});

const decodeAlpha = (path: string, executable: string): Promise<Uint8Array> =>
  new Promise((resolvePromise, reject) => {
    const decoder = path.endsWith(".webm") ? ["-c:v", "libvpx-vp9"] : [];
    const process = spawn(executable, [
      "-hide_banner",
      "-loglevel",
      "error",
      ...decoder,
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

const edgeHasNonTransparent = (
  alpha: Uint8Array,
  edge: "top" | "right" | "bottom" | "left",
): boolean => {
  const samples: number[] = [];
  for (let index = 0; index < 512; index += 1) {
    if (edge === "top") samples.push(alpha[index]!);
    if (edge === "right") samples.push(alpha[index * 512 + 511]!);
    if (edge === "bottom") samples.push(alpha[511 * 512 + index]!);
    if (edge === "left") samples.push(alpha[index * 512]!);
  }
  return samples.some((value) => value > 0);
};

const alphaRange = (alpha: Uint8Array): { minimum: number; maximum: number } => {
  let minimum = 255;
  let maximum = 0;
  for (const value of alpha) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  return { minimum, maximum };
};

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
