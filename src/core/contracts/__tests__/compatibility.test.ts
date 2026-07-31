import { describe, expect, test } from 'bun:test';
import type {
  ConversionStatus,
  GeneratedArtifactIdentity,
  GeneratedDocumentKind,
} from '../artifacts';
import type {
  DiagnosticSeverity,
  DiagnosticStage,
  GenerationDiagnostic,
} from '../diagnostics';
import type { EvidenceRef } from '../evidence';
import type {
  EffectProfile,
  FoundryTarget,
  FvttTargetVersion,
} from '../target';
import type {
  GeneratedArtifactIdentity as PackageGeneratedArtifactIdentity,
  GenerationDiagnostic as PackageGenerationDiagnostic,
  FoundryTarget as PackageFoundryTarget,
} from '@fvtt-json-generator/contracts';

describe('legacy contract import adapters', () => {
  test('remain type-compatible with the workspace contracts package', () => {
    const evidence: EvidenceRef = { start: 0, end: 4, quote: 'test' };
    const diagnostic: GenerationDiagnostic = {
      code: 'compatibility-check',
      severity: 'info' satisfies DiagnosticSeverity,
      stage: 'semantic' satisfies DiagnosticStage,
      path: '$',
      message: 'legacy contract paths remain importable',
      evidence: [evidence],
    };
    const artifact: GeneratedArtifactIdentity = {
      kind: 'actor' satisfies GeneratedDocumentKind,
      name: 'Compatibility Actor',
      itemCount: 0,
    };
    const target = {
      fvttVersion: '14' satisfies FvttTargetVersion,
      dnd5eVersion: '5.3.3',
      stats: {
        coreVersion: '14.364',
        systemId: 'dnd5e',
        systemVersion: '5.3.3',
      },
      reference: { dnd5eRepo: 'local-test-reference' },
      effectProfiles: ['core' satisfies EffectProfile],
    } satisfies FoundryTarget;
    const status: ConversionStatus = 'accepted';
    const packageArtifact: PackageGeneratedArtifactIdentity = artifact;
    const packageDiagnostic: PackageGenerationDiagnostic = diagnostic;
    const packageTarget: PackageFoundryTarget = target;

    expect({
      artifact: packageArtifact,
      diagnostic: packageDiagnostic,
      status,
      target: packageTarget,
    }).toEqual({
      artifact: { kind: 'actor', name: 'Compatibility Actor', itemCount: 0 },
      diagnostic: {
        code: 'compatibility-check',
        severity: 'info',
        stage: 'semantic',
        path: '$',
        message: 'legacy contract paths remain importable',
        evidence: [{ start: 0, end: 4, quote: 'test' }],
      },
      status: 'accepted',
      target: {
        fvttVersion: '14',
        dnd5eVersion: '5.3.3',
        stats: {
          coreVersion: '14.364',
          systemId: 'dnd5e',
          systemVersion: '5.3.3',
        },
        reference: { dnd5eRepo: 'local-test-reference' },
        effectProfiles: ['core'],
      },
    });
  });
});
