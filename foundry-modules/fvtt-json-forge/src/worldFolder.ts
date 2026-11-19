import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { FORGE_IMPORT_FLAG_SCOPE } from '@fvtt-json-generator/contracts/forge-import-lifecycle';

type WorldFolderType = 'Actor' | 'Item';
export const FORGE_ARCHIVE_SETTINGS = 'archiveFolders';
export const FORGE_ARCHIVE_DESTINATIONS = {
  Actor: { type: 'Actor', label: '角色', defaultPath: 'Forge' },
  Item: { type: 'Item', label: '物品', defaultPath: 'Forge / Item' },
  Spell: { type: 'Item', label: '法术', defaultPath: 'Forge / Spell' },
} as const;
export type ForgeFolderDestination = keyof typeof FORGE_ARCHIVE_DESTINATIONS;

export interface WorldFolder {
  id: string;
  name: string;
  type: string;
  folder?: WorldFolder | null;
}

export interface ForgeArchiveGame {
  folders?: ForgeWorldFolders;
  settings?: {
    get(scope: string, key: string): unknown;
    set(scope: string, key: string, value: Partial<Record<ForgeFolderDestination, string>>): Promise<unknown>;
  };
}

export interface ForgeWorldFolders {
  contents: readonly WorldFolder[];
  get(id: string): WorldFolder | undefined;
  documentClass: {
    create(data: Record<string, unknown>, options: { keepId: boolean }): Promise<WorldFolder | undefined>;
  };
}

export async function resolveForgeWorldFolder(
  game: ForgeArchiveGame,
  destination: ForgeFolderDestination,
  preferred?: unknown,
): Promise<string> {
  const { folders } = game;
  if (!folders) throw new Error('Foundry 世界文件夹不可用。');
  const { type, label } = FORGE_ARCHIVE_DESTINATIONS[destination];
  const configured = readForgeArchiveSettings(game)[destination];
  if (configured) {
    if (folders.get(configured)?.type !== type) throw new Error(`${label}的自选文件夹已删除或不可用。请在 Forge「归档位置」重新选择。`);
    return configured;
  }
  if (typeof preferred === 'string' && folders.get(preferred)?.type === type) return preferred;

  const root = await ensureFolder(folders, type, 'Forge');
  if (type === 'Actor') return root;
  const item = await ensureFolder(folders, type, 'Item', root);
  const spell = await ensureFolder(folders, type, 'Spell', root);
  return destination === 'Spell' ? spell : item;
}

export function readForgeArchiveSettings(game: ForgeArchiveGame): Partial<Record<ForgeFolderDestination, string>> {
  return (game.settings?.get(FORGE_IMPORT_FLAG_SCOPE, FORGE_ARCHIVE_SETTINGS) ?? {}) as Partial<Record<ForgeFolderDestination, string>>;
}

export function worldFolderPath(folder: WorldFolder): string {
  const path = [folder.name];
  for (let parent = folder.folder; parent; parent = parent.folder) path.unshift(parent.name);
  return path.join(' / ');
}

export function describeForgeWorldFolder(game: ForgeArchiveGame, destination: ForgeFolderDestination, preferred?: unknown): string {
  const { type, defaultPath } = FORGE_ARCHIVE_DESTINATIONS[destination];
  const configured = readForgeArchiveSettings(game)[destination];
  const id = configured || (typeof preferred === 'string' ? preferred : '');
  const folder = id ? game.folders?.get(id) : undefined;
  if (configured && folder?.type !== type) return '归档文件夹不可用，请重新选择归档位置';
  return '创建到 ' + (type === 'Actor' ? '角色目录' : '物品目录') + ' / '
    + (folder?.type === type ? worldFolderPath(folder) : defaultPath);
}

async function ensureFolder(folders: ForgeWorldFolders, type: WorldFolderType, name: string, parent?: string): Promise<string> {
  const key = parent ? `${type}:${parent}:${name}` : type;
  const id = sha256(`fvtt-json-forge:world-folder:${key}`).slice(0, 16);
  const known = folders.get(id);
  const isAtDestination = (folder?: WorldFolder): folder is WorldFolder =>
    folder?.type === type && folder.folder?.id === parent;
  if (isAtDestination(known)) return known.id;
  const existing = folders.contents.find(folder => isAtDestination(folder) && folder.name === name);
  if (existing) return existing.id;

  try {
    // Removing a folder alone promotes its children. Preserve those folders where Foundry moved them.
    const requestedId = known ? {} : { _id: id };
    const created = await folders.documentClass.create({ ...requestedId, name, type, folder: parent ?? null }, { keepId: !known });
    if (!isAtDestination(created) || (!known && created.id !== id)) throw new Error(`Foundry 未将 ${name} 保存到预期的文件夹层级。`);
    return created.id;
  } catch (error) {
    const concurrent = folders.get(id);
    if (isAtDestination(concurrent)) return concurrent.id;
    throw error;
  }
}
