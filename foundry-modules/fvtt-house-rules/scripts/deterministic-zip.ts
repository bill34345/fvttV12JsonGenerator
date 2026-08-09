import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function u32(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

async function files(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) found.push(...await files(root, absolute));
    else if (entry.isFile()) found.push(path.relative(root, absolute));
  }
  return found.sort((left, right) => left.localeCompare(right));
}

/** Uncompressed ZIP with sorted entries and a fixed DOS timestamp (1980-01-01). */
export async function writeDeterministicZip(sourceDirectory: string, outputFile: string): Promise<void> {
  const relativePaths = await files(sourceDirectory);
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const relative of relativePaths) {
    const archivePath = relative.replaceAll(path.sep, "/");
    const name = Buffer.from(archivePath, "utf8");
    const data = await readFile(path.join(sourceDirectory, relative));
    const checksum = crc32(data);
    const localHeader = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x0021),
      u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data
    ]);
    local.push(localHeader);
    central.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x0021),
      u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name
    ]));
    offset += localHeader.length;
  }
  const centralBytes = Buffer.concat(central);
  const ending = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(relativePaths.length), u16(relativePaths.length),
    u32(centralBytes.length), u32(offset), u16(0)
  ]);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, Buffer.concat([...local, centralBytes, ending]));
}

export async function zipEntryNames(zipPath: string): Promise<string[]> {
  const data = await readFile(zipPath);
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("ZIP end record is absent");
  const entries = data.readUInt16LE(end + 10);
  let cursor = data.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let index = 0; index < entries; index += 1) {
    if (data.readUInt32LE(cursor) !== 0x02014b50) throw new Error("ZIP central directory is invalid");
    const nameLength = data.readUInt16LE(cursor + 28);
    const extraLength = data.readUInt16LE(cursor + 30);
    const commentLength = data.readUInt16LE(cursor + 32);
    names.push(data.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

export async function fileSize(file: string): Promise<number> {
  return (await stat(file)).size;
}
