import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DocumentDoctorReport } from './types';

export interface DocumentDoctorOptions {
  pythonPath?: string;
  tesseractPath?: string;
}

export function defaultPdfScriptPath(): string {
  return fileURLToPath(new URL('../scripts/pdf_extract.py', import.meta.url));
}

export function defaultPaddleOcrScriptPath(): string {
  return fileURLToPath(new URL('../scripts/paddleocr_extract.py', import.meta.url));
}

export function defaultPdfRenderScriptPath(): string {
  return fileURLToPath(new URL('../scripts/pdf_render_page.py', import.meta.url));
}

export function resolvePythonCommand(explicit?: string): string {
  const configured = explicit?.trim() || process.env.FVTT_DOCUMENT_PYTHON?.trim();
  if (configured) return configured;
  const localVenv = resolve(
    process.cwd(),
    '.local',
    'document-ocr',
    process.platform === 'win32' ? join('Scripts', 'python.exe') : join('bin', 'python'),
  );
  return existsSync(localVenv) ? localVenv : 'python';
}

export function resolveTesseractCommand(explicit?: string): string {
  return explicit?.trim() || process.env.FVTT_DOCUMENT_TESSERACT?.trim() || 'tesseract';
}

export function runDocumentDoctor(options: DocumentDoctorOptions = {}): DocumentDoctorReport {
  const pythonCommand = resolvePythonCommand(options.pythonPath);
  const tesseractCommand = resolveTesseractCommand(options.tesseractPath);
  const warnings: string[] = [];
  let pythonVersion: string | undefined;
  let pdfplumber = false;
  let paddleocr = false;

  const pythonCheck = runCommand(pythonCommand, ['-c', 'import sys; print(sys.version.split()[0]); import pdfplumber; print("pdfplumber=1"); import pypdfium2; print("pypdfium2=1");'], 4_000);
  if (pythonCheck.ok) {
    const lines = pythonCheck.stdout.trim().split(/\r?\n/).filter(Boolean);
    pythonVersion = lines[0];
    pdfplumber = lines.includes('pdfplumber=1');
    if (!lines.includes('pypdfium2=1')) warnings.push('Python 已有 pdfplumber，但缺少 pypdfium2；扫描 PDF 无法自动渲染为 OCR 图片。');
  } else {
    warnings.push(`Python 不可用或缺少 pdfplumber：${pythonCheck.error}`);
  }

  const paddleCheck = runCommand(pythonCommand, ['-c', 'import paddleocr; print("paddleocr=1")'], 60_000);
  paddleocr = paddleCheck.ok && paddleCheck.stdout.includes('paddleocr=1');
  if (!paddleocr) warnings.push(`PaddleOCR 不可用：${commandError(paddleCheck) || '未检测到 paddleocr 模块'}`);

  const tesseractCheck = runCommand(tesseractCommand, ['--version'], 4_000);
  const tesseract = tesseractCheck.ok;
  const tesseractLanguages = tesseract
    ? listTesseractLanguages(tesseractCommand)
    : [];
  if (!tesseract) warnings.push(`Tesseract 不可用：${commandError(tesseractCheck)}`);

  const nativePdfReady = pdfplumber && existsSync(defaultPdfScriptPath());
  const pdfRendering = pdfplumber && pythonCheck.ok && pythonCheck.stdout.includes('pypdfium2=1') && existsSync(defaultPdfRenderScriptPath());
  const imageOcrReady = paddleocr || (tesseract && tesseractLanguages.includes('eng'));
  if (tesseract && !tesseractLanguages.includes('chi_sim')) {
    warnings.push('Tesseract 未安装 chi_sim；中文或中英混排图片应优先安装 PaddleOCR，不能假定英文 OCR 能正确识别中文。');
  }

  return {
    pythonCommand,
    ...(pythonVersion ? { pythonVersion } : {}),
    pdfplumber,
    paddleocr,
    tesseract,
    tesseractLanguages,
    nativePdfReady,
    pdfRendering,
    imageOcrReady,
    warnings,
  };
}

export function listTesseractLanguages(command = resolveTesseractCommand()): string[] {
  const result = runCommand(command, ['--list-langs'], 4_000);
  if (!result.ok) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of available languages'));
}

export function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): { ok: true; stdout: string; stderr: string } | { ok: false; error: string; stdout?: string; stderr?: string } {
  try {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    if (result.error) return { ok: false, error: result.error.message, stdout, stderr };
    if (result.status !== 0) return { ok: false, error: stderr.trim() || `exit code ${String(result.status)}`, stdout, stderr };
    return { ok: true, stdout, stderr };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function runJsonScript(
  pythonCommand: string,
  scriptPath: string,
  args: string[],
  timeoutMs = 120_000,
): unknown {
  try {
    const stdout = execFileSync(pythonCommand, [scriptPath, ...args], {
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 128 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`文档本地处理程序执行失败：${message}`);
  }
}

function commandError(result: ReturnType<typeof runCommand>): string {
  return result.ok ? '' : result.error;
}
