import type { EffectProfile } from '../generator/effectProfileApplier';
import type { ItemDocument } from '../generator/item-generator';
import type { ActionData } from '../models/action';
import type { ItemStage, ParsedItem, UsesData } from '../models/item';
import type { FvttTargetVersion } from '../foundryTarget';
import type { GenerationDiagnostic } from '../generation/types';
import { adaptParsedItemToCanonical } from '../generation/adapters';
import { getGenerationProjector } from '../generation/projectors';
import { verifyGeneratedDocument } from '../generation/verification';
import type {
  CanonicalItemDocument,
  GenerationVerification,
} from '../generation/types';

export interface ItemGenerationWorkflowOptions {
  fvttVersion: FvttTargetVersion;
  effectProfile: EffectProfile;
}

export interface ItemGenerationArtifact {
  stageIndex?: number;
  fileName: string;
  item: ItemDocument;
  diagnostics: GenerationDiagnostic[];
  canonical: CanonicalItemDocument;
  verification: GenerationVerification;
}

export async function generateItemArtifacts(
  parsed: ParsedItem,
  options: ItemGenerationWorkflowOptions,
): Promise<ItemGenerationArtifact[]> {
  const expanded = expandParsedItemStages(parsed);
  const projector = getGenerationProjector(options.fvttVersion);
  const artifacts: ItemGenerationArtifact[] = [];
  for (const entry of expanded) {
    const canonical = adaptParsedItemToCanonical(entry.parsed);
    const item = await projector.project(canonical, {
      ...options,
      targetVersion: options.fvttVersion,
    }) as ItemDocument;
    if (entry.stage) {
      const flags = (item.flags ??= {});
      const ownFlags = (flags.fvttJsonGenerator ??= {});
      ownFlags.stage = {
        index: entry.stageIndex,
        name: entry.stage.name,
        sourceDerived: entry.sourceMechanicsPresent,
      };
    }
    const verification = verifyGeneratedDocument({
      canonical,
      output: item,
      target: options.fvttVersion,
      effectProfile: options.effectProfile,
    });
    verification.diagnostics.push(...entry.diagnostics);
    if (entry.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      verification.status = 'failed';
    } else if (entry.diagnostics.some((diagnostic) => diagnostic.severity === 'warning')
      && verification.status === 'accepted') {
      verification.status = 'needs_review';
    }
    artifacts.push({
      stageIndex: entry.stageIndex,
      fileName: `${item.name}.json`,
      item,
      diagnostics: verification.diagnostics,
      canonical,
      verification,
    });
  }
  return artifacts;
}

interface ExpandedStage {
  stage?: ItemStage;
  stageIndex?: number;
  parsed: ParsedItem;
  sourceMechanicsPresent: boolean;
  diagnostics: GenerationDiagnostic[];
}

export function expandParsedItemStages(parsed: ParsedItem): ExpandedStage[] {
  if (!parsed.stages || parsed.stages.length === 0) {
    return [{
      parsed,
      sourceMechanicsPresent: true,
      diagnostics: [],
    }];
  }
  if (parsed.stages.length === 1) {
    const stage = parsed.stages[0]!;
    const sourceMechanicsPresent = Boolean(
      (stage.requirements?.length ?? 0) > 0
      || Object.values(stage.actions ?? {}).some((entries) => (entries?.length ?? 0) > 0),
    );
    return [{
      stage,
      stageIndex: 0,
      parsed,
      sourceMechanicsPresent,
      diagnostics: sourceMechanicsPresent ? [] : [{
        code: 'GEN_STAGE_LITERAL_REVIEW_REQUIRED',
        severity: 'warning',
        stage: 'ir',
        path: 'item/stages/0',
        message: `Stage "${stage.name}" has no structured mechanics; its text is preserved for review.`,
      }],
    }];
  }

  return parsed.stages.map((stage, stageIndex) => {
    const cumulativeRequirements = parsed.stages!
      .slice(0, stageIndex + 1)
      .flatMap((entry) => entry.requirements ?? []);
    const structuredActions = filterStructuredActionsByStage(
      parsed.structuredActions,
      parsed.stages!,
      stageIndex,
    );
    const stageUses = findStageUses(stage, structuredActions?.uses) ?? parsed.uses;
    const sourceMechanicsPresent = Boolean(
      (stage.requirements?.length ?? 0) > 0
      || Object.values(stage.actions ?? {}).some((entries) => (entries?.length ?? 0) > 0),
    );
    const suffix = stageIndex === 0 ? '' : ` (${stage.name})`;
    const diagnostics: GenerationDiagnostic[] = sourceMechanicsPresent ? [] : [{
      code: 'GEN_STAGE_LITERAL_REVIEW_REQUIRED',
      severity: 'warning',
      stage: 'ir',
      path: `item/stages/${stageIndex}`,
      message: `Stage "${stage.name}" has no structured mechanics; its text is preserved for review.`,
    }];

    return {
      stage,
      stageIndex,
      sourceMechanicsPresent,
      diagnostics,
      parsed: {
        ...parsed,
        name: `${parsed.name}${suffix}`,
        description: [parsed.description, stage.description].filter(Boolean).join('\n\n'),
        cumulativeRequirements,
        uses: stageUses,
        structuredActions,
      },
    };
  });
}

function findStageUses(
  stage: ItemStage,
  cumulativeUses: ActionData[] | undefined,
): UsesData | undefined {
  const explicitStageUses = stage.actions?.uses ?? [];
  const candidates = explicitStageUses.length > 0
    ? explicitStageUses
    : [...(cumulativeUses ?? [])].reverse();
  for (const action of candidates) {
    const limited = action.useAction?.limitedUses;
    if (!limited) continue;
    return {
      spent: limited.spent,
      max: limited.max,
      recovery: limited.recovery as UsesData['recovery'],
    };
  }
  return undefined;
}

function filterStructuredActionsByStage(
  structuredActions: ParsedItem['structuredActions'],
  stages: ItemStage[],
  stageIndex: number,
): ParsedItem['structuredActions'] {
  if (!structuredActions) return undefined;
  const cumulativeRequirements = new Set(
    stages.slice(0, stageIndex + 1).flatMap((stage) => stage.requirements ?? []),
  );
  const currentRequirements = new Set(stages[stageIndex]?.requirements ?? []);
  const filter = (actions: ActionData[] | undefined): ActionData[] | undefined => {
    if (!actions) return undefined;
    const selected = actions.filter((action) => {
      const text = action.desc ?? action.useAction?.description;
      if (!text) return true;
      if (action.passiveEffect?.type === 'acBonus') {
        return currentRequirements.has(text);
      }
      return cumulativeRequirements.has(text);
    });
    return selected.length > 0 ? selected : undefined;
  };

  return {
    attacks: structuredActions.attacks,
    saves: filter(structuredActions.saves),
    utilities: filter(structuredActions.utilities),
    casts: filter(structuredActions.casts),
    effects: filter(structuredActions.effects),
    uses: filter(structuredActions.uses),
  };
}
