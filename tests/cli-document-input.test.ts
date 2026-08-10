import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve(process.cwd(), 'src/index.ts');
const DOCUMENT_RUN_ROOT = resolve(process.cwd(), '.local', 'document-runs');

setDefaultTimeout(30_000);

describe('CLI document input', () => {
  test('routes a PDF through extract-only and emits the document artifacts', () => {
    const root = mkdtempSync(join(tmpdir(), 'fvtt-cli-document-'));
    const inputPath = join(root, 'fixture.pdf');
    writeFileSync(inputPath, minimalPdfBytes());
    let runPath: string | undefined;

    try {
      const result = Bun.spawnSync({
        cmd: ['bun', 'run', CLI, inputPath, '--document-engine', 'native', '--extract-only'],
        cwd: process.cwd(),
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;
      runPath = output.match(/Run directory: (.+)/)?.[1]?.trim();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('Status: extracted');
      expect(runPath).toBeDefined();
      expect(runPath!.startsWith(`${DOCUMENT_RUN_ROOT}\\`)).toBe(true);
      expect(existsSync(join(runPath!, 'raw-extracted.md'))).toBe(true);
      expect(existsSync(join(runPath!, 'document-candidates.json'))).toBe(true);
      expect(existsSync(join(runPath!, 'extraction-report.json'))).toBe(true);
      expect(readFileSync(join(runPath!, 'raw-extracted.md'), 'utf-8')).toContain('fixture.pdf');
    } finally {
      if (runPath?.startsWith(`${DOCUMENT_RUN_ROOT}\\`)) rmSync(runPath, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function minimalPdfBytes(): Uint8Array {
  const content = 'BT /F1 12 Tf 10 80 Td (Fixture document text for native extraction validation. This page intentionally contains enough text to avoid OCR fallback. The document input route is being tested.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
