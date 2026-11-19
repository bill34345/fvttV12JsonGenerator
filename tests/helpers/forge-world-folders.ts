import type { ForgeWorldFolders } from '../../foundry-modules/fvtt-json-forge/src/worldFolder';

export function fakeWorldFolders(initial: ForgeWorldFolders['contents'] = []): ForgeWorldFolders {
  const contents = [...initial];
  return {
    contents,
    get: id => contents.find(folder => folder.id === id),
    documentClass: {
      async create(data) {
        const parent = contents.find(folder => folder.id === data.folder);
        const folder = { id: String(data._id ?? `generated-${contents.length + 1}`), name: String(data.name), type: String(data.type), ...(parent ? { folder: parent } : {}) };
        contents.push(folder);
        return folder;
      },
    },
  };
}
