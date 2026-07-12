export interface PatchResult {
  source: string;
  changed: boolean;
}

const PATCH_SENTINEL = "token.document?.parent?.id !== canvas.scene?.id";

export function patchMonksBloodsplatsSource(source: string): PatchResult {
  if (source.includes(PATCH_SENTINEL)) {
    return { source, changed: false };
  }

  const spriteMarker = "        let s = new PIXI.Sprite(tex);";
  const getBloodImageIndex = source.indexOf("static async getBloodImage(token, animate)");
  const spriteIndex = source.indexOf(spriteMarker, getBloodImageIndex);
  const positionIndex = source.indexOf("s.x = token.x", spriteIndex);

  if (getBloodImageIndex < 0 || spriteIndex < 0 || positionIndex < 0) {
    throw new Error(
      "Monk's Bloodsplats 14.01 vulnerable source block was not found",
    );
  }

  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const guard = [
    "        // Local v14 lifecycle guard: the token may be destroyed while its blood texture loads.",
    "        if (",
    "            token.destroyed ||",
    "            token.document?.parent?.id !== canvas.scene?.id ||",
    "            token.document?.object !== token ||",
    "            !token.transform",
    "        )",
    "            return;",
    "",
  ].join(newline);

  return {
    source: `${source.slice(0, spriteIndex)}${guard}${source.slice(spriteIndex)}`,
    changed: true,
  };
}

export async function patchMonksBloodsplatsFile(
  moduleFile: string,
): Promise<PatchResult> {
  const source = await readFile(moduleFile, "utf8");
  const result = patchMonksBloodsplatsSource(source);
  if (!result.changed) return result;

  const backupFile = `${moduleFile}.upstream-14.01.bak`;
  try {
    await access(backupFile);
  } catch {
    await copyFile(moduleFile, backupFile);
  }

  const temporaryFile = `${moduleFile}.codex-patch.tmp`;
  await writeFile(temporaryFile, result.source, "utf8");
  await rename(temporaryFile, moduleFile);
  return result;
}
import { access, copyFile, readFile, rename, writeFile } from "node:fs/promises";
