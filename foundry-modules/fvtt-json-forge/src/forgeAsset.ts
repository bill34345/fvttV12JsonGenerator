import { sha256 } from '@fvtt-json-generator/contracts/hash';

export async function ensureForgeAsset(foundry: any, path: string, bytes: Uint8Array, mime: string, assertWrite: () => void): Promise<void> {
  const fetchAsset = () => fetch(path, { cache: 'no-store', credentials: 'same-origin' });
  const expected = sha256(bytes);
  const existing = await fetchAsset();
  if (existing.ok) {
    if (sha256(new Uint8Array(await existing.arrayBuffer())) !== expected) throw new Error('现有图片内容与预览不符，拒绝覆盖。');
    return;
  }
  if (existing.status !== 404) throw new Error(`无法检查图片目标（HTTP ${existing.status}）。`);
  const Picker = foundry?.applications?.apps?.FilePicker?.implementation;
  if (!Picker) throw new Error('Foundry 文件上传接口不可用。');
  const segments = path.split('/');
  const name = segments.pop()!;
  let directory = '';
  for (const segment of segments) {
    const parent = directory;
    directory = parent ? `${parent}/${segment}` : segment;
    const listing = await Picker.browse('data', parent, { notify: false });
    if (!listing.dirs.includes(directory)) {
      assertWrite();
      try { await Picker.createDirectory('data', directory, { notify: false }); }
      catch (error) {
        if (!(await Picker.browse('data', parent, { notify: false })).dirs.includes(directory)) throw error;
      }
    }
  }
  assertWrite();
  await Picker.upload('data', directory, new File([new Uint8Array(bytes)], name, { type: mime }), {}, { notify: false });
  const readback = await fetchAsset();
  if (!readback.ok || sha256(new Uint8Array(await readback.arrayBuffer())) !== expected) throw new Error('图片上传回读校验失败。');
}
