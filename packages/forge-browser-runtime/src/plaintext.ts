import { hashSource, type Sha256 } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  normalizeBlock,
  parseCreatureBlock,
  splitCollection,
  type IngestedCreatureFile,
} from '@fvtt-json-generator/ingest-plaintext/plaintext-core';
import {
  auditIngestedCreature,
  type AuditIssue,
} from '@fvtt-json-generator/ingest-plaintext/audit-core';

export interface BrowserPlaintextCandidate {
  id: string;
  label: string;
  start: number;
  end: number;
  quote: string;
}

export interface BrowserPlaintextFinding {
  id: string;
  code: string;
  path: string;
  message: string;
  blocking: boolean;
  origin: 'plaintext-boundary' | 'plaintext-parser' | 'plaintext-audit';
  evidence?: Array<{ start: number; end: number; quote: string }>;
}

export interface BrowserPlaintextCreatureProjection {
  chineseName: string;
  englishName: string;
  slug: string;
  fileName: string;
  frontmatter: Record<string, unknown>;
  sections: Record<string, string>;
  rawNotes: string[];
}

export interface BrowserPlaintextActorAnalysis {
  status: 'ready_to_generate' | 'needs_review' | 'failed';
  rawSourceHash?: Sha256;
  candidates: BrowserPlaintextCandidate[];
  candidate?: BrowserPlaintextCandidate;
  creature?: BrowserPlaintextCreatureProjection;
  canonicalSource?: string;
  findings: BrowserPlaintextFinding[];
  errorCode?: 'input_empty' | 'input_too_large' | 'no_entities' | 'multiple_entities' | 'coverage_gap' | 'parse_failed' | 'audit_blocked';
}

const MAX_PLAINTEXT_UTF8_BYTES = 200_000;

export function analyzePlaintextActorSource(source: string): BrowserPlaintextActorAnalysis {
  if (typeof source !== 'string' || !source.trim()) {
    return { status: 'failed', candidates: [], findings: [], errorCode: 'input_empty' };
  }
  if (new TextEncoder().encode(source).byteLength > MAX_PLAINTEXT_UTF8_BYTES) {
    return { status: 'failed', candidates: [], findings: [], errorCode: 'input_too_large' };
  }
  const rawSourceHash = hashSource(source);
  const blocks = splitCollection(source);
  const candidates = blocks.map((entry, index) => ({
    id: `plaintext-${index + 1}`,
    label: entry.englishName ? `${entry.chineseName} (${entry.englishName})` : entry.chineseName,
    start: entry.start,
    end: entry.end,
    quote: entry.quote,
  }));
  if (candidates.length === 0) {
    return {
      status: 'needs_review', rawSourceHash, candidates, errorCode: 'no_entities',
      findings: [boundaryFinding('PLAINTEXT_NO_ENTITY', 'Plaintext source does not contain one recognized creature heading.')],
    };
  }
  if (candidates.length !== 1) {
    return {
      status: 'needs_review', rawSourceHash, candidates, errorCode: 'multiple_entities',
      findings: [boundaryFinding('PLAINTEXT_MULTIPLE_ENTITIES', `Plaintext source contains ${candidates.length} creature candidates; Forge Intake accepts exactly one.`)],
    };
  }
  const candidate = candidates[0]!;
  const outside = `${source.slice(0, candidate.start)}${source.slice(candidate.end)}`;
  if (outside.trim()) {
    return {
      status: 'needs_review', rawSourceHash, candidates, candidate, errorCode: 'coverage_gap',
      findings: [boundaryFinding('PLAINTEXT_SOURCE_COVERAGE_GAP', 'Non-whitespace source text exists outside the single recognized creature boundary.')],
    };
  }
  try {
    const creature = parseCreatureBlock(normalizeBlock(blocks[0]!.rawBlock));
    const auditFindings = buildPlaintextAuditFindings(creature, candidate);
    const blocking = auditFindings.some((finding) => finding.blocking);
    return {
      status: blocking ? 'needs_review' : 'ready_to_generate',
      rawSourceHash,
      candidates,
      candidate,
      creature: projectCreature(creature),
      canonicalSource: creature.markdown,
      findings: auditFindings,
      ...(blocking ? { errorCode: 'audit_blocked' as const } : {}),
    };
  } catch (error) {
    return {
      status: 'needs_review', rawSourceHash, candidates, candidate, errorCode: 'parse_failed',
      findings: [{
        id: 'PLAINTEXT_PARSE_FAILED',
        code: 'PLAINTEXT_PARSE_FAILED',
        path: '/source',
        message: error instanceof Error ? error.message : 'Plaintext creature could not be parsed reliably.',
        blocking: true,
        origin: 'plaintext-parser',
        evidence: [{ start: candidate.start, end: candidate.end, quote: candidate.quote }],
      }],
    };
  }
}

export function buildPlaintextAuditFindings(
  creature: Pick<IngestedCreatureFile, 'chineseName' | 'englishName' | 'frontmatter'>,
  candidate?: BrowserPlaintextCandidate,
): BrowserPlaintextFinding[] {
  return auditIngestedCreature(creature).map((issue, index) => auditFinding(issue, index, candidate));
}

function auditFinding(issue: AuditIssue, index: number, candidate?: BrowserPlaintextCandidate): BrowserPlaintextFinding {
  return {
    id: `PLAINTEXT_AUDIT_${index}:${issue.field}`,
    code: `PLAINTEXT_AUDIT_${issue.severity.toUpperCase()}`,
    path: `/creature/${issue.field}`,
    message: `${issue.reason}; expected ${issue.expectedValue}, received ${issue.originalValue || '(empty)'}.`,
    blocking: issue.severity === 'error' || issue.severity === 'warning',
    origin: 'plaintext-audit',
    ...(candidate ? { evidence: [{ start: candidate.start, end: candidate.end, quote: candidate.quote }] } : {}),
  };
}

function boundaryFinding(code: string, message: string): BrowserPlaintextFinding {
  return { id: code, code, path: '/source', message, blocking: true, origin: 'plaintext-boundary' };
}

function projectCreature(creature: IngestedCreatureFile): BrowserPlaintextCreatureProjection {
  return structuredClone({
    chineseName: creature.chineseName,
    englishName: creature.englishName,
    slug: creature.slug,
    fileName: creature.fileName,
    frontmatter: creature.frontmatter,
    sections: creature.sections,
    rawNotes: creature.rawNotes,
  });
}
