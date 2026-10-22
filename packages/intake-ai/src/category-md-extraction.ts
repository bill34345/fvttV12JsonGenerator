import { sourceFeatureBasicOmissions } from '@fvtt-json-generator/models/source-operations';
import type { CanonicalFeature, ExtractionRequest, MonsterIntakeIR } from './types';
import { SOURCE_OPERATION_CONTRACT } from './source-operation-contract';
import { isSourceSpellcastingFeature } from './staged-spellcasting';
import { assembleStagedFeature, assembleStagedMonsterIntake, validateStagedBaseFacts } from './staged-extraction';
import { assembleStagedLinePartition, splitStagedMonsterSource, StagedExtractionError } from './staged-source';
import { categoryMdFeatureProposal, extractCategoryMd, prepareCategoryMdBatches, type CategoryMdBatch } from './category-md';

/** A/B share the same already supplied base facts; this port performs no I/O. */
export function prepareCategoryMdExtraction(request: ExtractionRequest, baseFacts: unknown, linePartition?: unknown) {
  const plan = linePartition === undefined ? splitStagedMonsterSource(request) : assembleStagedLinePartition(request, linePartition);
  const base = validateStagedBaseFacts(plan, baseFacts);
  const batches = plan.features.length ? prepareCategoryMdBatches({
    source: plan.source, baseContext: plan.base.quote, mechanicsInstructions: SOURCE_OPERATION_CONTRACT,
    units: plan.features.map(unit => ({ id: unit.id, section: unit.section!, name: unit.name!,
      start: unit.start, end: unit.end, quote: unit.quote,
      context: (unit.contextIds ?? []).map(id => plan.units.find(context => context.id === id)!.quote),
    })),
  }) : [];
  return { plan, base, batches };
}

const same = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => same(value, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
    return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => Object.hasOwn(right, key) && same(left[key], right[key]));
  }
  return a === b;
};

/** Experimental B ingress. All original A assemblers/gates are used unchanged.
 * No provider, network, retry, repair or model-derived answer is constructed here.
 * Deterministic splitting or an explicitly supplied common partition is required. */
export async function runCategoryMdMonsterExtraction(input: {
  request: ExtractionRequest;
  baseFacts: unknown;
  linePartition?: unknown;
  call: (batch: CategoryMdBatch) => Promise<unknown>;
  signal?: AbortSignal;
}): Promise<{ ir: MonsterIntakeIR; categoryCalls: number; featureCount: number }> {
  input.signal?.throwIfAborted();
  const { plan, base, batches } = prepareCategoryMdExtraction(input.request, input.baseFacts, input.linePartition);
  if (!batches.length) return { ir: assembleStagedMonsterIntake(plan, base, []), categoryCalls: 0, featureCount: 0 };
  const output = await extractCategoryMd({ batches, call: input.call, signal: input.signal,
    acceptFeature: item => {
      const unit = plan.features.find(unit => unit.id === item.unit.id)!;
      const proposal = categoryMdFeatureProposal(item);
      // Resource/activation fields are source-owned in A's OP carrier. Check
      // explicitly supplied MD values against that same assembler, then retain
      // only its existing proposal keys; do not silently discard wrong values.
      const owned = proposal.facts.sourceOperations ? { ...proposal, facts: {
        sourceOperations: proposal.facts.sourceOperations,
        ...(proposal.facts.sharedUses !== undefined ? { sharedUses: proposal.facts.sharedUses } : {}),
      } } : proposal;
      if (isSourceSpellcastingFeature(unit.quote)) {
        // The shared spell assembler consumes source/profile data, not an OP
        // proposal. Never let that dispatch silently swallow wrong MD fields.
        if (!proposal.facts.spellcastingAbility && (proposal.mode !== 'manual' || Object.keys(proposal.facts).length))
          throw new StagedExtractionError('UNSUPPORTED_FIELD', `/features/${unit.id}/facts`);
        return owned; // Full shared spell assembly validates the bounded profile.
      }
      const feature = assembleStagedFeature(plan, unit, owned, base.creature.identity.name,
        [base.creature.identity.name, base.creature.identity.englishName].filter((name): name is string => !!name));
      if (proposal.facts.sourceOperations) for (const key of ['uses', 'recharge', 'activationType', 'legendaryCost'] as const) {
        if (proposal.facts[key] !== undefined && !same(proposal.facts[key], feature[key]))
          throw new StagedExtractionError('FEATURE_FACT_CONFLICT', `/features/${unit.id}/facts/${key}`);
      }
      // A may restore a known single heal from a manual proposal. B must have
      // actually filled that heal; otherwise the template would be the answer.
      if (feature.healing && proposal.facts.healing === undefined)
        throw new StagedExtractionError('UNRESTORED_BASIC_OPERATION', `/features/${unit.id}/healing`);
      const omissions = sourceFeatureBasicOmissions(unit.quote.trim(), feature as CanonicalFeature);
      if (omissions.length) throw new StagedExtractionError('UNRESTORED_BASIC_OPERATION', `/features/${unit.id}/${omissions.join(',')}`);
      return owned;
    },
    assemble: values => assembleStagedMonsterIntake(plan, base, plan.features.map(unit => values.get(unit.id))),
  });
  return { ir: output.result, categoryCalls: output.categoryCalls, featureCount: output.featureCount };
}
