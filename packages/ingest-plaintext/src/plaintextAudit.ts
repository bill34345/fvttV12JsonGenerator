import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  auditPlainTextMarkdownFiles,
  emitAuditMarkdown,
  summarizeAuditIssues,
} from './plaintextAuditCore';
export * from './plaintextAuditCore';
import type { AuditIssue, AuditReport } from './plaintextAuditCore';

export interface PlainTextAuditWorkflowResult {
  sourcePath: string;
  emitDir: string;
  reportPath: string;
  creatureCount: number;
  issues: AuditIssue[];
}
/** Node-only adapter around the browser-safe deterministic audit core. */
export class PlainTextAuditWorkflow {
  public audit(middleDir: string, sourcePath: string, auditDir?: string): PlainTextAuditWorkflowResult {
    const files = readdirSync(middleDir)
      .filter((file) => file.endsWith('.md'))
      .map((fileName) => ({
        fileName,
        content: readFileSync(join(middleDir, fileName), 'utf-8'),
      }));
    const result = auditPlainTextMarkdownFiles(files);
    const reportPath = this.getReportPath(sourcePath, auditDir);
    const report: AuditReport = {
      date: new Date().toISOString().split('T')[0]!,
      sourceFile: basename(sourcePath),
      creatureCount: result.creatureCount,
      issues: result.issues,
      summary: summarizeAuditIssues(result.issues),
    };

    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, emitAuditMarkdown(report));

    return {
      sourcePath,
      emitDir: middleDir,
      reportPath,
      creatureCount: result.creatureCount,
      issues: result.issues,
    };
  }

  private getReportPath(sourcePath: string, auditDir?: string): string {
    const date = new Date().toISOString().split('T')[0]!;
    const slug = basename(sourcePath, '.md').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const dir = auditDir ?? join(process.cwd(), 'audits');
    return join(dir, `${date}-${slug}-audit.md`);
  }
}
