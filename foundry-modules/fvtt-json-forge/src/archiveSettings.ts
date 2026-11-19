import { assertExactRuntime, assertGm, MODULE_ID, type ForgeGameLike } from './runtime';
import { FORGE_ARCHIVE_DESTINATIONS, FORGE_ARCHIVE_SETTINGS, readForgeArchiveSettings, worldFolderPath, type ForgeFolderDestination } from './worldFolder';

type ArchiveFolders = Partial<Record<ForgeFolderDestination, string>>;

export async function openForgeArchiveSettings(game: ForgeGameLike, foundry: any, document: Document): Promise<void> {
  assertGm(game);
  assertExactRuntime(game);
  const { folders, settings } = game;
  const Dialog = foundry?.applications?.api?.DialogV2;
  if (!folders || !settings || !Dialog) throw new Error('Foundry 归档位置设置不可用。');

  const current = readForgeArchiveSettings(game);
  const content = document.createElement('div');
  const destinations = Object.keys(FORGE_ARCHIVE_DESTINATIONS) as ForgeFolderDestination[];
  for (const destination of destinations) {
    const { type, label, defaultPath } = FORGE_ARCHIVE_DESTINATIONS[destination];
    const field = document.createElement('label');
    field.className = 'form-group';
    const caption = document.createElement('span');
    caption.textContent = label;
    const select = document.createElement('select');
    select.name = destination;
    addOption(select, '', `默认 · ${defaultPath}`);
    const choices = folders.contents.filter(folder => folder.type === type)
      .map(folder => ({ id: folder.id, label: worldFolderPath(folder) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    for (const choice of choices) addOption(select, choice.id, choice.label);
    const selected = current[destination] ?? '';
    if (selected && folders.get(selected)?.type !== type) addOption(select, selected, '所选文件夹已删除或不可用，请重新选择');
    for (const option of select.options) option.defaultSelected = option.value === selected;
    field.append(caption, select);
    content.append(field);
  }

  const selected: ArchiveFolders | null = await Dialog.wait({
    window: { title: 'Forge · 归档位置' },
    modal: true,
    content,
    buttons: [
      { action: 'save', label: '保存', default: true, callback: (_event: Event, button: HTMLButtonElement) => {
        const selected: ArchiveFolders = {};
        for (const destination of destinations) {
          const select = button.form!.elements.namedItem(destination) as HTMLSelectElement;
          if (select.value) selected[destination] = select.value;
        }
        return selected;
      } },
      { action: 'cancel', label: '取消', callback: () => null },
    ],
  });
  if (!selected || typeof selected !== 'object') return;
  assertGm(game);
  assertExactRuntime(game);
  for (const destination of destinations) {
    const id = selected[destination];
    const { type, label } = FORGE_ARCHIVE_DESTINATIONS[destination];
    if (id && folders.get(id)?.type !== type) throw new Error(`${label}的自选文件夹已删除或不可用。请在 Forge「归档位置」重新选择。`);
  }
  await settings.set(MODULE_ID, FORGE_ARCHIVE_SETTINGS, selected);
}

function addOption(select: HTMLSelectElement, id: string, label: string): void {
  const option = select.ownerDocument.createElement('option');
  option.value = id;
  option.textContent = label;
  select.append(option);
}
