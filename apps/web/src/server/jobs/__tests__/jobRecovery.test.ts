import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createJob, getJob, jobDir, resetJobsForTests, runningJobsTotal, updateJob } from '../jobStore';

const owned: string[] = [];
afterEach(() => {
  resetJobsForTests({ preserveFiles: true });
  for (const path of owned.splice(0)) rmSync(path, { recursive: true });
});

describe('persisted job restart recovery', () => {
  test('a failed atomic replacement does not publish success in memory', () => {
    const job = createJob('single-convert', '127.0.0.1');
    owned.push(jobDir(job.id));
    const marker = join(jobDir(job.id), 'result.json');
    rmSync(marker);
    mkdirSync(marker);
    expect(() => updateJob(job.id, { status: 'succeeded' })).toThrow();
    expect(getJob(job.id)!.status).toBe('queued');
    expect(runningJobsTotal()).toBe(1);
    expect(readdirSync(jobDir(job.id))).toEqual(['result.json']);
  });
  test.each(['queued', 'running'] as const)('%s becomes interrupted without replay', status => {
    const job = createJob('item-collection', '127.0.0.1');
    owned.push(jobDir(job.id));
    updateJob(job.id, { status });
    expect(getJob(job.id)!.status).toBe(status);
    resetJobsForTests({ preserveFiles: true });
    expect(runningJobsTotal()).toBe(0);
    const recovered = getJob(job.id)!;
    expect(recovered.status).toBe('failed');
    expect(recovered.error?.code).toBe('JOB_INTERRUPTED');
    expect(runningJobsTotal()).toBe(0);
    expect(JSON.parse(readFileSync(join(jobDir(job.id), 'result.json'), 'utf8')).status).toBe('failed');
    expect(readdirSync(jobDir(job.id))).toEqual(['result.json']);
    resetJobsForTests({ preserveFiles: true });
    expect(getJob(job.id)!.logs).toHaveLength(1);
  });
  test('terminal results remain intact across restart', () => {
    const job = createJob('single-convert', '127.0.0.1');
    owned.push(jobDir(job.id));
    const terminal = updateJob(job.id, { status: 'succeeded', summary: { count: 2 } });
    resetJobsForTests({ preserveFiles: true });
    expect(getJob(job.id)).toEqual(terminal);
  });
});
