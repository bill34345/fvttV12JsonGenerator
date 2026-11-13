/** Build metadata does not change dependency or runtime version ordering. */
export function isVersionAtLeast(version: unknown, minimum: string): boolean {
  const parsed = parseVersion(version);
  const required = parseVersion(minimum);
  return parsed !== undefined && required !== undefined && meetsMinimum(parsed, required);
}

/** Core/system adapters additionally retain their supported major boundary. */
export function isVersionInMajor(version: unknown, minimum: string): boolean {
  const parsed = parseVersion(version);
  const required = parseVersion(minimum);
  return parsed !== undefined && required !== undefined && parsed.parts[0] === required.parts[0]
    && meetsMinimum(parsed, required);
}

type ParsedVersion = { parts: number[]; prerelease?: string };

function parseVersion(version: unknown): ParsedVersion | undefined {
  if (typeof version !== 'string') return undefined;
  const match = /^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) return undefined;
  return { parts: match[1]!.split('.').map(Number), ...(match[2] === undefined ? {} : { prerelease: match[2] }) };
}

function meetsMinimum(version: ParsedVersion, minimum: ParsedVersion): boolean {
  const required = minimum.parts;
  for (let index = 0; index < Math.max(version.parts.length, required.length); index += 1) {
    const actual = version.parts[index] ?? 0;
    const lower = required[index] ?? 0;
    if (actual !== lower) return actual > lower;
  }
  if (version.prerelease === minimum.prerelease) return true;
  if (version.prerelease === undefined) return true;
  if (minimum.prerelease === undefined) return false;
  const actualIds = version.prerelease.split('.');
  const requiredIds = minimum.prerelease.split('.');
  for (let index = 0; index < Math.max(actualIds.length, requiredIds.length); index += 1) {
    const actual = actualIds[index];
    const lower = requiredIds[index];
    if (actual === lower) continue;
    if (actual === undefined) return false;
    if (lower === undefined) return true;
    const actualNumeric = /^\d+$/.test(actual);
    const lowerNumeric = /^\d+$/.test(lower);
    if (actualNumeric && lowerNumeric) return Number(actual) >= Number(lower);
    if (actualNumeric !== lowerNumeric) return !actualNumeric;
    return actual > lower;
  }
  return true;
}
