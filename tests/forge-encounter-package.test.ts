import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  FORGE_ENCOUNTER_PACKAGE_MAX_BYTES,
  decodeEncounterAssetBytes,
  decodeForgeEncounterPackageText,
  decodeForgeEncounterPackageZip,
  encodeForgeEncounterPackageZip,
  encounterPackageHash,
  hashEncounterBytes,
  serializeForgeEncounterPackage,
  type ForgeEncounterPackage,
} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const PNG_BASE64 = btoa(String.fromCharCode(...PNG_BYTES));

describe('Forge encounter package contract', () => {
  test('rejects URL-significant image names and MIME-extension disagreement',()=>{
    for(const fileName of ['a%2fb.png','a%5cb.png','a#b.png','a.webp','a.png?x']){
      const raw:any=JSON.parse(serializeForgeEncounterPackage(validBundle()));raw.assets[0].fileName=fileName;
      expect(()=>decodeForgeEncounterPackageText(JSON.stringify(raw))).toThrow();
    }
  });
  test('round-trips normalized JSON, stored ZIP, deflated ZIP, and asset bytes', async () => {
    const bundle = validBundle();
    const text = serializeForgeEncounterPackage(bundle);
    const decoded = decodeForgeEncounterPackageText(text);
    expect(decoded).toEqual(bundle);
    expect(Object.isFrozen(decoded)).toBeTrue();
    expect(Object.isFrozen(decoded.actors)).toBeTrue();
    expect(Object.isFrozen(decoded.assets[0]!.targets[0]!.fields)).toBeTrue();
    expect(serializeForgeEncounterPackage(decoded)).toBe(text);
    expect(encounterPackageHash(decoded)).toBe(encounterPackageHash(bundle));
    expect(hashEncounterBytes(decodeEncounterAssetBytes(decoded.assets[0]!))).toBe(decoded.assets[0]!.sha256);

    const zip = await encodeForgeEncounterPackageZip(bundle);
    expect(new DataView(zip.buffer, zip.byteOffset, zip.byteLength).getUint32(0, true)).toBe(0x04034b50);
    await expect(decodeForgeEncounterPackageZip(zip)).resolves.toEqual(decoded);
    await expect(decodeForgeEncounterPackageZip(await deflateSingleEntryZip(zip))).resolves.toEqual(decoded);
  });

  test('rejects unknown keys, duplicate keys, broken references, and source, command, or asset hash drift', () => {
    const raw = JSON.parse(serializeForgeEncounterPackage(validBundle()));
    expect(() => decodeForgeEncounterPackageText(JSON.stringify({ ...raw, unexpected: true }))).toThrow(/exactly/u);
    expect(() => decodeForgeEncounterPackageText(JSON.stringify({ ...raw, actors: [raw.actors[0], { ...raw.actors[0], label: 'Duplicate' }] }))).toThrow(/Duplicate actor keys/u);
    expect(() => decodeForgeEncounterPackageText(JSON.stringify({ ...raw, primaryActorKey: 'absent' }))).toThrow(/reference/u);
    expect(() => decodeForgeEncounterPackageText(JSON.stringify({
      ...raw,
      macros: [{ ...raw.macros[0], bindings: { primary: 'absent' } }],
    }))).toThrow(/reference/u);
    expect(() => decodeForgeEncounterPackageText(JSON.stringify({
      ...raw,
      actors: [{ ...raw.actors[0], sourceHash: '0'.repeat(64) }],
    }))).toThrow(/sourceHash/u);
    expect(() => decodeForgeEncounterPackageText(JSON.stringify({
      ...raw,
      macros: [{ ...raw.macros[0], commandHash: '0'.repeat(64) }],
    }))).toThrow(/commandHash/u);
    expect(() => decodeForgeEncounterPackageText(JSON.stringify({
      ...raw,
      assets: [{ ...raw.assets[0], base64: PNG_BASE64.slice(0, -1) + 'B' }],
    }))).toThrow(/sha256/u);
  });

  test('treats macro commands as inert data', () => {
    const marker = '__forgeEncounterCommandMustRemainInert';
    const raw = validBundle();
    const command = `globalThis.${marker} = true;`;
    const bundle: ForgeEncounterPackage = {
      ...raw,
      macros: [{ ...raw.macros[0]!, command, commandHash: hashSource(command) }],
    };
    const text = serializeForgeEncounterPackage(bundle);
    const decoded = decodeForgeEncounterPackageText(text);
    expect(decoded.macros[0]!.command).toBe(command);
    expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
  });

  test('rejects unsafe ZIP paths and ZIP entries claiming an expanded package over the limit', async () => {
    const zip = await encodeForgeEncounterPackageZip(validBundle());
    const traversal = replaceAllAscii(zip, 'encounter.json', '../ounter.json');
    await expect(decodeForgeEncounterPackageZip(traversal)).rejects.toThrow(/path/u);

    const tooLarge = new Uint8Array(zip);
    const centralOffset = findSignature(tooLarge, 0x02014b50);
    const view = new DataView(tooLarge.buffer, tooLarge.byteOffset, tooLarge.byteLength);
    const localOffset = view.getUint32(centralOffset + 42, true);
    view.setUint32(centralOffset + 24, FORGE_ENCOUNTER_PACKAGE_MAX_BYTES + 1, true);
    view.setUint32(localOffset + 22, FORGE_ENCOUNTER_PACKAGE_MAX_BYTES + 1, true);
    await expect(decodeForgeEncounterPackageZip(tooLarge)).rejects.toThrow(/expanded content/u);
  });
});

function validBundle(): ForgeEncounterPackage {
  const source = 'Goblin source Markdown';
  const command = 'await game.macros.getName("Goblin Aid")?.execute();';
  return {
    schema: 'fvtt-json-forge-encounter',
    version: 1,
    id: 'goblin-ambush',
    label: 'Goblin Ambush',
    target: { foundry: '14.364', system: 'dnd5e', systemVersion: '5.3.3', effectProfile: 'core' },
    primaryActorKey: 'goblin',
    actors: [{ key: 'goblin', label: 'Goblin', source, sourceHash: hashSource(source) }],
    macros: [{
      key: 'goblin-aid',
      name: 'Goblin Aid',
      command,
      commandHash: hashSource(command),
      bindings: { primary: 'goblin' },
      covers: [{ actorKey: 'goblin', mechanicId: 'goblin-aid' }],
      notes: 'Run only after the imported Actor has been reviewed.',
    }],
    assets: [{
      key: 'goblin-token',
      fileName: 'goblin-token.png',
      mime: 'image/png',
      base64: PNG_BASE64,
      sha256: hashEncounterBytes(PNG_BYTES),
      targets: [{ actorKey: 'goblin', fields: ['img', 'prototypeToken.texture.src'] }],
    }],
  };
}

function findSignature(input: Uint8Array, signature: number): number {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  for (let offset = 0; offset <= input.byteLength - 4; offset += 1) {
    if (view.getUint32(offset, true) === signature) return offset;
  }
  throw new Error(`ZIP signature ${signature.toString(16)} was not found.`);
}

function replaceAllAscii(input: Uint8Array, from: string, to: string): Uint8Array {
  if (from.length !== to.length) throw new Error('ZIP path replacement must keep the same byte length.');
  const result = new Uint8Array(input);
  const source = new TextEncoder().encode(from);
  const replacement = new TextEncoder().encode(to);
  let replacements = 0;
  for (let offset = 0; offset <= result.byteLength - source.byteLength; offset += 1) {
    if (source.every((byte, index) => result[offset + index] === byte)) {
      result.set(replacement, offset);
      replacements += 1;
      offset += source.byteLength - 1;
    }
  }
  if (replacements !== 2) throw new Error('Expected ZIP path in local and central entries.');
  return result;
}

async function deflateSingleEntryZip(input: Uint8Array): Promise<Uint8Array> {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const centralOffset = findSignature(input, 0x02014b50);
  const nameLength = view.getUint16(centralOffset + 28, true);
  const localOffset = view.getUint32(centralOffset + 42, true);
  const localNameLength = view.getUint16(localOffset + 26, true);
  const localExtraLength = view.getUint16(localOffset + 28, true);
  const dataLength = view.getUint32(centralOffset + 20, true);
  const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
  const path = new Uint8Array(input.subarray(centralOffset + 46, centralOffset + 46 + nameLength));
  const data = new Uint8Array(input.subarray(dataOffset, dataOffset + dataLength));
  const compressed = new Uint8Array(await new Response(
    new Blob([data.slice().buffer]).stream().pipeThrough(new CompressionStream('deflate-raw')),
  ).arrayBuffer());
  const checksum = view.getUint32(centralOffset + 16, true);
  const local = new Uint8Array(30 + path.byteLength);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(6, 0x0800, true); localView.setUint16(8, 8, true);
  localView.setUint32(14, checksum, true); localView.setUint32(18, compressed.byteLength, true); localView.setUint32(22, data.byteLength, true); localView.setUint16(26, path.byteLength, true);
  local.set(path, 30);
  const central = new Uint8Array(46 + path.byteLength);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true); centralView.setUint16(8, 0x0800, true); centralView.setUint16(10, 8, true);
  centralView.setUint32(16, checksum, true); centralView.setUint32(20, compressed.byteLength, true); centralView.setUint32(24, data.byteLength, true); centralView.setUint16(28, path.byteLength, true);
  central.set(path, 46);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, 1, true); endView.setUint16(10, 1, true);
  endView.setUint32(12, central.byteLength, true); endView.setUint32(16, local.byteLength + compressed.byteLength, true);
  return concat([local, compressed, central, end]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}
