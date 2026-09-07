import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const docsRoot = resolve(import.meta.dir, "../docs/runtime-acceptance-micro-batches");
const readBatch = (name: string): Promise<string> =>
  readFile(resolve(docsRoot, name), "utf8");

describe("current runtime acceptance documentation", () => {
  test("routes retired audio checks to R02 without rewriting history", async () => {
    const [b07, b08, b09, b10, b90, index, r02, b13] = await Promise.all([
      readBatch("B07-p2-square-media-cluster.md"),
      readBatch("B08-player-audio-recording.md"),
      readBatch("B09-p2-hex-rows.md"),
      readBatch("B10-p2-hex-columns.md"),
      readBatch("B90-final-gates-no-cleanup.md"),
      readBatch("README.md"),
      readBatch("R02-audio-retirement-legacy-cleanup.md"),
      readBatch("B13-art-style-square.md"),
    ]);

    expect(b07).toContain("SUPERSEDED");
    expect(b08).toContain("RETIRED — NOT APPLICABLE");
    expect(b09).toContain("SUPERSEDED");
    expect(b10).toContain("SUPERSEDED");
    expect(index).toContain("R01（预览）→ R02（音频退役与旧声音清理）→ B90");
    expect(b90).not.toContain("B08 录制已交给用户");
    expect(b90).not.toContain("音频文件存在");
    expect(r02).toContain("零模块音频请求");
    expect(b13).toContain("`visualBleed: 0.08`");
    expect(b13).toContain("不重跑 B11、B12、SQ-011");
  });
});
