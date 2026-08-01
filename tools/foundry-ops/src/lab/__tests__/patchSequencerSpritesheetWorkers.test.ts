import { describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createHermeticLabConfig as createLabConfig } from "../../config";
import {
  patchSequencerSpritesheetWorkerFile,
  patchSequencerSpritesheetWorkerInstall,
  patchSequencerSpritesheetWorkerSource,
  SEQUENCER_WORKER_PATCH_SENTINEL,
  sequencerWorkerPatchArtifacts,
} from "../patchSequencerSpritesheetWorkers";

const upstreamFormula =
  "    const workerCount = Math.max(Math.floor((navigator.hardwareConcurrency - 2) / 2), 1);";
const patchedFormula =
  "    const workerCount = Math.min(Math.max(Math.floor((navigator.hardwareConcurrency - 2) / 2), 1), 2);";

const upstreamSource = `
class SpritesheetGenerator {
  #workers = {};
  #freeWorkers = [];
  #workerFreeCallbacks = [];
  constructor() {
${upstreamFormula}
    for (let i = 0; i < workerCount; i++) {
      const workerId = String(i);
      const worker = new WorkerWrapper();
      this.#workers[workerId] = worker;
      this.#freeWorkers.push(workerId);
      worker.onmessage = this.#getMessageHandler(workerId);
    }
  }
}
`;

function workerCount(source: string, hardwareConcurrency: number): number {
  const match = source.match(/const workerCount = ([^;]+);/);
  if (!match) throw new Error("Worker formula missing");
  const navigator = { hardwareConcurrency };
  return Function(
    "navigator",
    `"use strict"; return (${match[1]});`,
  )(navigator) as number;
}

async function createInstall(options?: {
  version?: string;
  bundleNames?: string[];
  source?: string;
}) {
  const tempRoot = await mkdtemp(join(tmpdir(), "sequencer-worker-patch-"));
  const repoRoot = join(tempRoot, "repo");
  const config = createLabConfig(repoRoot);
  const moduleRoot = join(
    config.profiles.serverMirror.dataPath,
    "Data",
    "modules",
    "sequencer",
  );
  const distRoot = join(moduleRoot, "dist");
  await mkdir(distRoot, { recursive: true });
  await writeFile(
    join(moduleRoot, "module.json"),
    JSON.stringify({
      id: "sequencer",
      version: options?.version ?? "4.2.3",
    }),
    "utf8",
  );
  const bundleNames = options?.bundleNames ?? ["SpritesheetGenerator-test.js"];
  for (const name of bundleNames) {
    await writeFile(join(distRoot, name), options?.source ?? upstreamSource, "utf8");
  }
  return {
    tempRoot,
    config,
    distRoot,
    moduleFile: join(distRoot, bundleNames[0] ?? "SpritesheetGenerator-test.js"),
  };
}

describe("Sequencer spritesheet worker source patch", () => {
  test("caps the upstream formula at two while retaining its minimum of one", () => {
    const result = patchSequencerSpritesheetWorkerSource(upstreamSource);
    expect(result.changed).toBe(true);
    expect(result.source).toContain(patchedFormula);
    expect(result.source).not.toContain(upstreamFormula);
    expect(result.source.match(new RegExp(SEQUENCER_WORKER_PATCH_SENTINEL, "g")))
      .toHaveLength(1);
    expect(workerCount(result.source, 16)).toBe(2);
    expect(workerCount(result.source, 4)).toBe(1);
    expect(workerCount(result.source, 2)).toBe(1);
  });

  test("is idempotent only for the exact expected patched shape", () => {
    const once = patchSequencerSpritesheetWorkerSource(upstreamSource);
    const twice = patchSequencerSpritesheetWorkerSource(once.source);
    expect(twice).toEqual({ source: once.source, changed: false });
    expect(() =>
      patchSequencerSpritesheetWorkerSource(
        once.source.replace(patchedFormula, "    const workerCount = 7;"),
      ),
    ).toThrow("exact local Sequencer 4.2.3 worker-cap patch shape");
  });

  test("fails closed when the upstream formula is absent or duplicated", () => {
    expect(() =>
      patchSequencerSpritesheetWorkerSource("class Other {}"),
    ).toThrow("exact unpatched Sequencer 4.2.3 worker source shape");
    expect(() =>
      patchSequencerSpritesheetWorkerSource(
        `${upstreamSource}\n${upstreamFormula}`,
      ),
    ).toThrow("exact unpatched Sequencer 4.2.3 worker source shape");
  });

  test("replaces a standalone file without leaving its temporary file", async () => {
    const root = await mkdtemp(join(tmpdir(), "sequencer-worker-file-"));
    const moduleFile = join(root, "SpritesheetGenerator-test.js");
    try {
      await writeFile(moduleFile, upstreamSource, "utf8");
      const result = await patchSequencerSpritesheetWorkerFile(moduleFile);
      expect(result.changed).toBe(true);
      expect(await readFile(moduleFile, "utf8")).toContain(patchedFormula);
      expect(await sequencerWorkerPatchArtifacts(moduleFile)).toEqual({
        temporaryExists: false,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("Sequencer spritesheet worker install patch", () => {
  test("dry-run reports hashes without writing a backup or bundle", async () => {
    const fixture = await createInstall();
    try {
      const result = await patchSequencerSpritesheetWorkerInstall(
        fixture.config,
        { apply: false },
      );
      expect(result).toMatchObject({
        apply: false,
        restore: false,
        changed: true,
        version: "4.2.3",
      });
      expect(result.beforeSha256).not.toBe(result.afterSha256);
      expect(await readFile(fixture.moduleFile, "utf8")).toBe(upstreamSource);
      expect(await readdir(fixture.distRoot)).toEqual([
        "SpritesheetGenerator-test.js",
      ]);
    } finally {
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("apply preserves an exclusive upstream backup and is idempotent", async () => {
    const fixture = await createInstall();
    try {
      const first = await patchSequencerSpritesheetWorkerInstall(
        fixture.config,
        { apply: true },
      );
      expect(first.changed).toBe(true);
      expect(await readFile(first.backupFile, "utf8")).toBe(upstreamSource);
      expect(await readFile(first.moduleFile, "utf8")).toContain(patchedFormula);
      expect(await sequencerWorkerPatchArtifacts(first.moduleFile)).toEqual({
        temporaryExists: false,
      });

      const second = await patchSequencerSpritesheetWorkerInstall(
        fixture.config,
        { apply: true },
      );
      expect(second.changed).toBe(false);
      expect(second.beforeSha256).toBe(first.afterSha256);
      expect(await readFile(first.backupFile, "utf8")).toBe(upstreamSource);
    } finally {
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("does not overwrite an existing valid backup", async () => {
    const fixture = await createInstall();
    try {
      const backupFile = `${fixture.moduleFile}.upstream-4.2.3.bak`;
      await writeFile(backupFile, upstreamSource, "utf8");
      await patchSequencerSpritesheetWorkerInstall(fixture.config, {
        apply: true,
      });
      expect(await readFile(backupFile, "utf8")).toBe(upstreamSource);
    } finally {
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("rejects an existing backup with an unknown shape", async () => {
    const fixture = await createInstall();
    try {
      await writeFile(
        `${fixture.moduleFile}.upstream-4.2.3.bak`,
        "unknown backup",
        "utf8",
      );
      await expect(
        patchSequencerSpritesheetWorkerInstall(fixture.config, { apply: true }),
      ).rejects.toThrow("Backup is not the exact unpatched");
    } finally {
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("supports dry-run restore and exact apply restore without deleting backup", async () => {
    const fixture = await createInstall();
    try {
      const applied = await patchSequencerSpritesheetWorkerInstall(
        fixture.config,
        { apply: true },
      );
      const dryRun = await patchSequencerSpritesheetWorkerInstall(
        fixture.config,
        { apply: false, restore: true },
      );
      expect(dryRun).toMatchObject({
        apply: false,
        restore: true,
        changed: true,
        beforeSha256: applied.afterSha256,
        afterSha256: applied.beforeSha256,
      });
      expect(await readFile(fixture.moduleFile, "utf8")).toContain(patchedFormula);

      const restored = await patchSequencerSpritesheetWorkerInstall(
        fixture.config,
        { apply: true, restore: true },
      );
      expect(restored.afterSha256).toBe(applied.beforeSha256);
      expect(await readFile(fixture.moduleFile, "utf8")).toBe(upstreamSource);
      expect(await readFile(restored.backupFile, "utf8")).toBe(upstreamSource);
    } finally {
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  test("restore rejects an unpatched current bundle and a missing backup", async () => {
    const unpatched = await createInstall();
    try {
      await expect(
        patchSequencerSpritesheetWorkerInstall(unpatched.config, {
          apply: false,
          restore: true,
        }),
      ).rejects.toThrow("exact local Sequencer 4.2.3 worker-cap patch shape");
    } finally {
      await rm(unpatched.tempRoot, { recursive: true, force: true });
    }

    const patched = patchSequencerSpritesheetWorkerSource(upstreamSource).source;
    const missing = await createInstall({ source: patched });
    try {
      await expect(
        patchSequencerSpritesheetWorkerInstall(missing.config, {
          apply: false,
          restore: true,
        }),
      ).rejects.toThrow("restore backup is missing");
    } finally {
      await rm(missing.tempRoot, { recursive: true, force: true });
    }
  });

  test("rejects an unknown version, missing bundle, or multiple bundles", async () => {
    const unknownVersion = await createInstall({ version: "4.2.4" });
    try {
      await expect(
        patchSequencerSpritesheetWorkerInstall(unknownVersion.config, {
          apply: false,
        }),
      ).rejects.toThrow("Expected sequencer 4.2.3");
    } finally {
      await rm(unknownVersion.tempRoot, { recursive: true, force: true });
    }

    const missing = await createInstall({ bundleNames: [] });
    try {
      await expect(
        patchSequencerSpritesheetWorkerInstall(missing.config, {
          apply: false,
        }),
      ).rejects.toThrow("found 0");
    } finally {
      await rm(missing.tempRoot, { recursive: true, force: true });
    }

    const multiple = await createInstall({
      bundleNames: [
        "SpritesheetGenerator-one.js",
        "SpritesheetGenerator-two.js",
      ],
    });
    try {
      await expect(
        patchSequencerSpritesheetWorkerInstall(multiple.config, {
          apply: false,
        }),
      ).rejects.toThrow("found 2");
    } finally {
      await rm(multiple.tempRoot, { recursive: true, force: true });
    }
  });
});

class MockWorkerPool {
  private free = ["0", "1"];
  private waiters: Array<(worker: string) => void> = [];

  async run<T>(task: (worker: string) => Promise<T>): Promise<T> {
    const worker =
      this.free.pop() ??
      (await new Promise<string>((resolve) => this.waiters.push(resolve)));
    try {
      return await task(worker);
    } finally {
      const waiter = this.waiters.shift();
      if (waiter) waiter(worker);
      else this.free.push(worker);
    }
  }
}

describe("the retained two-worker queue contract", () => {
  test("starts two tasks, queues the third, then releases it", async () => {
    const pool = new MockWorkerPool();
    const releases: Array<() => void> = [];
    const started: number[] = [];
    const jobs = [0, 1, 2].map((id) =>
      pool.run(async () => {
        started.push(id);
        await new Promise<void>((resolve) => releases.push(resolve));
        return id;
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    releases.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual([0, 1, 2]);
    releases.splice(0).forEach((release) => release());
    expect(await Promise.all(jobs)).toEqual([0, 1, 2]);
  });

  test("returns a worker after failure so later queued work completes", async () => {
    const pool = new MockWorkerPool();
    const results = await Promise.allSettled([
      pool.run(async () => {
        throw new Error("simulated conversion failure");
      }),
      pool.run(async () => "second"),
      pool.run(async () => "third"),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "rejected",
      "fulfilled",
      "fulfilled",
    ]);
    expect(results[2]).toEqual({ status: "fulfilled", value: "third" });
  });
});
