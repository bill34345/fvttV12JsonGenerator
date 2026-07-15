import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { TEMP_WEB_DIR } from '../paths';

export type WebJobStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed';

export type WebJobType =
  | 'single-convert'
  | 'monster-collection'
  | 'item-collection'
  | 'vault-sync'
  | 'translate-json'
  | 'ingest-plaintext'
  | 'ingest-plaintext-actors'
  | 'ingest-items'
  | 'goddessfantasy-board-crawl'
  | 'records-to-plaintext';

export interface WebJobFile {
  id: string;
  fileName: string;
  path: string;
  contentType: string;
  label: string;
  size: number;
  downloadUrl: string;
}

export interface WebJobLogEntry {
  at: string;
  level: 'info' | 'success' | 'error';
  message: string;
}

export interface WebJobFailure {
  index?: number;
  sourceName?: string;
  file?: string;
  error: string;
}

export interface WebJob {
  id: string;
  type: WebJobType;
  status: WebJobStatus;
  createdAt: string;
  updatedAt: string;
  clientIp: string;
  progress: {
    current: number;
    total: number;
    label: string;
  };
  logs: WebJobLogEntry[];
  files: WebJobFile[];
  warnings: string[];
  failures: WebJobFailure[];
  summary: Record<string, unknown> | null;
  error?: {
    code: string;
    message: string;
  };
}

const jobs = new Map<string, WebJob>();
const activeJobIds = new Set<string>();
const jobRoot = resolve(TEMP_WEB_DIR, 'jobs');

export function createJob(type: WebJobType, clientIp: string): WebJob {
  const now = new Date().toISOString();
  const job: WebJob = {
    id: randomUUID(),
    type,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    clientIp,
    progress: {
      current: 0,
      total: 1,
      label: '等待运行',
    },
    logs: [],
    files: [],
    warnings: [],
    failures: [],
    summary: null,
  };

  mkdirSync(jobDir(job.id), { recursive: true });
  jobs.set(job.id, job);
  activeJobIds.add(job.id);
  persistJob(job);
  return job;
}

export function getJob(id: string): WebJob | undefined {
  return jobs.get(id) ?? readPersistedJob(id);
}

export function updateJob(id: string, update: Partial<WebJob>): WebJob {
  const current = getExistingJob(id);
  const next: WebJob = {
    ...current,
    ...update,
    updatedAt: new Date().toISOString(),
  };
  jobs.set(id, next);
  if (next.status === 'queued' || next.status === 'running') activeJobIds.add(id);
  else activeJobIds.delete(id);
  persistJob(next);
  return next;
}

export function setJobProgress(id: string, current: number, total: number, label: string): WebJob {
  return updateJob(id, {
    progress: {
      current,
      total,
      label,
    },
  });
}

export function appendJobLog(id: string, level: WebJobLogEntry['level'], message: string): WebJob {
  const current = getExistingJob(id);
  const nextLog = [
    ...current.logs,
    {
      at: new Date().toISOString(),
      level,
      message,
    },
  ];
  return updateJob(id, { logs: nextLog });
}

export function addJobFile(
  id: string,
  input: Omit<WebJobFile, 'id' | 'fileName' | 'size' | 'downloadUrl'> & { id?: string; fileName?: string },
): WebJobFile {
  const current = getExistingJob(id);
  const safeId = sanitizeFileId(input.id ?? input.fileName ?? basename(input.path));
  const fileName = sanitizeFileName(input.fileName ?? basename(input.path));
  const size = existsSync(input.path) ? statSync(input.path).size : 0;
  const file: WebJobFile = {
    id: safeId,
    fileName,
    path: input.path,
    contentType: input.contentType,
    label: input.label,
    size,
    downloadUrl: `/api/jobs/${id}/download/${encodeURIComponent(safeId)}`,
  };
  updateJob(id, { files: [...current.files.filter((item) => item.id !== safeId), file] });
  return file;
}

export function runningJobsForIp(ip: string): number {
  return [...activeJobIds].filter((id) => jobs.get(id)?.clientIp === ip).length;
}

export function runningJobsTotal(): number {
  return activeJobIds.size;
}

export function jobDir(id: string): string {
  return resolve(jobRoot, sanitizeJobId(id));
}

export function jobInputDir(id: string): string {
  return join(jobDir(id), 'input');
}

export function jobOutputDir(id: string): string {
  return join(jobDir(id), 'output');
}

export function cleanupExpiredJobs(
  retentionMs = 24 * 60 * 60 * 1000,
  maxRetainedJobs = 100,
): number {
  if (!existsSync(jobRoot)) return 0;

  const now = Date.now();
  let removed = 0;
  const retainedTerminal: Array<{ id: string; dir: string; mtimeMs: number }> = [];
  for (const entry of readdirSync(jobRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(jobRoot, entry.name);
    const marker = join(dir, 'result.json');
    const statPath = existsSync(marker) ? marker : dir;
    const mtimeMs = statSync(statPath).mtimeMs;
    if (activeJobIds.has(entry.name)) continue;

    if (now - mtimeMs >= retentionMs) {
      removeJobDirectory(entry.name, dir);
      removed++;
      continue;
    }
    retainedTerminal.push({ id: entry.name, dir, mtimeMs });
  }

  retainedTerminal.sort((left, right) => left.mtimeMs - right.mtimeMs || left.id.localeCompare(right.id));
  const excess = Math.max(0, retainedTerminal.length - Math.max(0, maxRetainedJobs));
  for (const record of retainedTerminal.slice(0, excess)) {
    removeJobDirectory(record.id, record.dir);
    removed++;
  }
  return removed;
}

export function resetJobsForTests(options: { preserveFiles?: boolean } = {}): void {
  jobs.clear();
  activeJobIds.clear();
  if (!options.preserveFiles) {
    rmSync(jobRoot, { recursive: true, force: true });
  }
}

function getExistingJob(id: string): WebJob {
  const job = getJob(id);
  if (!job) throw new Error(`Job not found: ${id}`);
  return job;
}

function persistJob(job: WebJob): void {
  mkdirSync(jobDir(job.id), { recursive: true });
  writeFileSync(join(jobDir(job.id), 'result.json'), `${JSON.stringify(job, null, 2)}\n`, 'utf-8');
}

function readPersistedJob(id: string): WebJob | undefined {
  const path = join(jobDir(id), 'result.json');
  if (!existsSync(path)) return undefined;
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as WebJob;
  jobs.set(parsed.id, parsed);
  return parsed;
}

function sanitizeJobId(id: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    throw new Error('Invalid job id.');
  }
  return id;
}

function sanitizeFileId(value: string): string {
  return sanitizeFileName(value).replace(/\s+/g, '_');
}

function sanitizeFileName(value: string): string {
  return basename(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || 'output';
}

function removeJobDirectory(id: string, dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  jobs.delete(id);
  activeJobIds.delete(id);
}
