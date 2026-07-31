import type { EvidenceRef } from './evidence';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';
export type DiagnosticStage = 'parse' | 'ir' | 'projection' | 'schema' | 'semantic';

export interface GenerationDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  stage: DiagnosticStage;
  path: string;
  message: string;
  evidence?: EvidenceRef[];
}
