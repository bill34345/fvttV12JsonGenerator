import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseCreatureBlock, splitCollection } from "../../ingest/plaintext";
import { ObsidianSyncWorkflow } from "../obsidianSync";

function listFilesRecursive(dir: string): string[] {
	if (!existsSync(dir)) return [];

	const out: string[] = [];
	const stack = [dir];

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) continue;

		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(full);
			} else if (entry.isFile()) {
				out.push(full);
			}
		}
	}

	return out;
}

describe("ObsidianSyncWorkflow", () => {
	const roots: string[] = [];

	afterAll(() => {
		for (const root of roots) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	let workflow: ObsidianSyncWorkflow;
	let vaultPath: string;
	let inputFile: string;

	beforeEach(async () => {
		workflow = new ObsidianSyncWorkflow({ translationService: null });
		vaultPath = mkdtempSync(join(tmpdir(), "fvtt-obsidian-sync-"));
		roots.push(vaultPath);

		const inputDir = join(vaultPath, "input");
		rmSync(inputDir, { recursive: true, force: true });

		await workflow.sync({ vaultPath });
		inputFile = join(vaultPath, "input", "test-npc.md");
		writeFileSync(
			inputFile,
			[
				"---",
				"名称: 测试龙",
				"类型: npc",
				"生命值: 100 (10d10+40)",
				"护甲等级: 16 (天生护甲)",
				"---",
				"# 背景",
				"这是一个测试生物。",
				"",
			].join("\n"),
		);
	});

	it("creates folders and generates output for new markdown", async () => {
		const result = await workflow.sync({ vaultPath });

		expect(result.processed).toBe(1);
		expect(result.failed).toBe(0);
		expect(result.skipped).toBe(0);

		expect(existsSync(join(vaultPath, "input"))).toBe(true);
		expect(existsSync(join(vaultPath, "examples"))).toBe(true);
		expect(existsSync(join(vaultPath, "output"))).toBe(true);
		expect(existsSync(join(vaultPath, "output_backup"))).toBe(true);
		expect(existsSync(join(vaultPath, ".fvtt-sync-manifest.json"))).toBe(true);
		expect(existsSync(join(vaultPath, "output", "test-npc.json"))).toBe(true);
	});

	it("skips unchanged markdown based on manifest hash", async () => {
		const first = await workflow.sync({ vaultPath });
		const second = await workflow.sync({ vaultPath });

		expect(first.processed).toBe(1);
		expect(second.processed).toBe(0);
		expect(second.skipped).toBe(1);
		expect(second.failed).toBe(0);
	});

	it("backs up previous json when same markdown is modified", async () => {
		await workflow.sync({ vaultPath });

		writeFileSync(
			inputFile,
			[
				"---",
				"名称: 测试龙-改",
				"类型: npc",
				"生命值: 120 (12d10+48)",
				"护甲等级: 17 (天生护甲)",
				"---",
				"# 背景",
				"内容已修改。",
				"",
			].join("\n"),
		);

		const result = await workflow.sync({ vaultPath });
		expect(result.processed).toBe(1);
		expect(result.backedUp).toBe(1);

		const backupFiles = listFilesRecursive(
			join(vaultPath, "output_backup"),
		).filter((f) => f.toLowerCase().endsWith(".json"));
		expect(backupFiles.length).toBeGreaterThan(0);
	});

	it("clears backup folder when clearBackup is enabled", async () => {
		await workflow.sync({ vaultPath });

		writeFileSync(
			inputFile,
			[
				"---",
				"名称: 清理备份测试",
				"类型: npc",
				"生命值: 90 (12d8+36)",
				"护甲等级: 15 (天生护甲)",
				"---",
				"测试",
				"",
			].join("\n"),
		);

		await workflow.sync({ vaultPath });
		const beforeClear = listFilesRecursive(
			join(vaultPath, "output_backup"),
		).length;
		expect(beforeClear).toBeGreaterThan(0);

		const result = await workflow.sync({ vaultPath, clearBackup: true });
		const afterClear = listFilesRecursive(
			join(vaultPath, "output_backup"),
		).length;

		expect(result.clearedBackup).toBe(true);
		expect(afterClear).toBe(0);
	});

	it("syncs mixed Chinese and English markdown files in one run", async () => {
		const englishInput = join(
			vaultPath,
			"input",
			"bestiary",
			"adult-red-dragon.md",
		);
		mkdirSync(join(vaultPath, "input", "bestiary"), { recursive: true });
		writeFileSync(
			englishInput,
			[
				"---",
				"layout: creature",
				"name: Adult Red Dragon",
				"type: dragon",
				"armor_class: 19 (natural armor)",
				"hit_points: 256 (19d12+133)",
				"challenge: 17 (18000 XP)",
				"strength: 27",
				"dexterity: 10",
				"constitution: 25",
				"intelligence: 16",
				"wisdom: 13",
				"charisma: 21",
				"---",
				"### Actions",
				"- Bite. Melee Weapon Attack: +14 to hit, reach 10 ft., one target.",
				"",
			].join("\n"),
		);

		const result = await workflow.sync({ vaultPath });
		expect(result.processed).toBe(2);
		expect(result.skipped).toBe(0);
		expect(result.failed).toBe(0);

		expect(existsSync(join(vaultPath, "output", "test-npc.json"))).toBe(true);
		expect(
			existsSync(
				join(vaultPath, "output", "bestiary", "adult-red-dragon.json"),
			),
		).toBe(true);
	});

	it("regenerates changed English file with backup while unchanged files still skip", async () => {
		const englishInput = join(vaultPath, "input", "bestiary", "frost-drake.md");
		mkdirSync(join(vaultPath, "input", "bestiary"), { recursive: true });
		writeFileSync(
			englishInput,
			[
				"---",
				"layout: creature",
				"name: Frost Drake",
				"type: dragon",
				"armor_class: 16 (natural armor)",
				"hit_points: 95 (10d10+40)",
				"challenge: 8 (3900 XP)",
				"strength: 22",
				"dexterity: 12",
				"constitution: 18",
				"intelligence: 8",
				"wisdom: 11",
				"charisma: 10",
				"---",
				"### Actions",
				"- Bite. Melee Weapon Attack: +9 to hit, reach 10 ft., one target.",
				"",
			].join("\n"),
		);

		const first = await workflow.sync({ vaultPath });
		expect(first.processed).toBe(2);
		expect(first.failed).toBe(0);

		const second = await workflow.sync({ vaultPath });
		expect(second.processed).toBe(0);
		expect(second.skipped).toBe(2);
		expect(second.backedUp).toBe(0);

		const englishOutput = join(
			vaultPath,
			"output",
			"bestiary",
			"frost-drake.json",
		);
		const beforeUpdate = JSON.parse(readFileSync(englishOutput, "utf-8")) as {
			name?: string;
		};
		expect(beforeUpdate.name).toBe("Frost Drake");

		writeFileSync(
			englishInput,
			[
				"---",
				"layout: creature",
				"name: Frost Drake Alpha",
				"type: dragon",
				"armor_class: 17 (natural armor)",
				"hit_points: 114 (12d10+48)",
				"challenge: 9 (5000 XP)",
				"strength: 23",
				"dexterity: 12",
				"constitution: 19",
				"intelligence: 8",
				"wisdom: 12",
				"charisma: 11",
				"---",
				"### Actions",
				"- Multiattack. The drake makes two attacks.",
				"- Bite. Melee Weapon Attack: +10 to hit, reach 10 ft., one target.",
				"",
			].join("\n"),
		);

		const third = await workflow.sync({ vaultPath });
		expect(third.processed).toBe(1);
		expect(third.skipped).toBe(1);
		expect(third.backedUp).toBe(1);
		expect(third.failed).toBe(0);

		const backupFiles = listFilesRecursive(
			join(vaultPath, "output_backup"),
		).filter(
			(file) =>
				file.toLowerCase().includes("frost-drake") &&
				file.toLowerCase().endsWith(".json"),
		);
		expect(backupFiles.length).toBeGreaterThan(0);

		const afterUpdate = JSON.parse(readFileSync(englishOutput, "utf-8")) as {
			name?: string;
		};
		expect(afterUpdate.name).toBe("Frost Drake Alpha");
	});

	it("removes stale output json when the source markdown is deleted", async () => {
		const first = await workflow.sync({ vaultPath });
		expect(first.processed).toBe(1);

		const outputPath = join(vaultPath, "output", "test-npc.json");
		expect(existsSync(outputPath)).toBe(true);

		rmSync(inputFile, { force: true });

		const second = await workflow.sync({ vaultPath });
		expect(second.processed).toBe(0);
		expect(second.failed).toBe(0);
		expect(existsSync(outputPath)).toBe(false);

		const manifest = JSON.parse(
			readFileSync(join(vaultPath, ".fvtt-sync-manifest.json"), "utf-8"),
		) as Record<string, { status?: string }>;
		expect(manifest["test-npc.md"]?.status).toBe("stale");
	});

	it("skips non-project markdown collections without failing sync", async () => {
		const collectionPath = join(vaultPath, "input", "raw-collection.md");
		writeFileSync(
			collectionPath,
			[
				"# **Raw Collection**",
				"",
				"**Hit Points (Hit Points)**: 10",
				"",
			].join("\n"),
		);

		const result = await workflow.sync({ vaultPath });
		expect(result.processed).toBe(1);
		expect(result.failed).toBe(0);
		expect(result.skipped).toBe(1);
		expect(existsSync(join(vaultPath, "output", "raw-collection.json"))).toBe(false);
	});

	it("defaults sync to core effect profile without midi-qol automation", async () => {
		const fixturePath = resolve(
			process.cwd(),
			"tests/fixtures/plaintext/月蚀矿腐化生物数据.md",
		);
		const collection = readFileSync(fixturePath, "utf-8");
		const bloodfinBlock = splitCollection(collection).find(
			(block) => block.englishName === "Slithering Bloodfin",
		);
		expect(bloodfinBlock).toBeDefined();
		if (!bloodfinBlock) {
			throw new Error("Expected Slithering Bloodfin block");
		}

		const generated = parseCreatureBlock(bloodfinBlock.rawBlock);
		writeFileSync(join(vaultPath, "input", generated.fileName), generated.markdown);

		const result = await workflow.sync({ vaultPath });
		expect(result.processed).toBe(2);
		expect(result.failed).toBe(0);

		const actor = JSON.parse(
			readFileSync(
				join(vaultPath, "output", generated.fileName.replace(/\.md$/i, ".json")),
				"utf-8",
			),
		) as { items: Array<{ effects?: any[] }> };
		expect(
			actor.items.some((item) =>
				(item.effects ?? []).some((effect) => Boolean(effect?.flags?.["midi-qol.OverTime"])),
			),
		).toBe(false);
	});
});
