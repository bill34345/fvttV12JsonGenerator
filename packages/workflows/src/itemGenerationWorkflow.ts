import type { EffectProfile } from '@fvtt-json-generator/generation/effect-profile';
import type { ItemDocument } from '@fvtt-json-generator/generation/item-generator';
import type { ActionData } from '@fvtt-json-generator/models/action';
import type { ItemStage, ParsedItem, UsesData } from '@fvtt-json-generator/models/item';
import type { FvttTargetVersion } from '@fvtt-json-generator/generation/target';
import type { GenerationDiagnostic } from '@fvtt-json-generator/generation/types';
import { adaptParsedItemToCanonical } from '@fvtt-json-generator/generation/adapters';
import { getGenerationProjector } from '@fvtt-json-generator/generation/projectors';
import { verifyGeneratedDocument } from '@fvtt-json-generator/generation/verification';
import type {
  CanonicalItemDocument,
  GenerationVerification,
} from '@fvtt-json-generator/generation/types';
import {
  createDisabledIconResolutionSession,
  type IconReviewReport,
  type IconWorkflowOptions,
  type IconWorkflowPort,
} from './iconPort';

import { projectNativeDocument, type NativeDocumentProjection } from './nativeProjection';

export interface ItemGenerationWorkflowOptions {
  stageIndex?: number;
  nativeProjection?: NativeDocumentProjection;
  nativeSourceNormalizer?: (item: ItemDocument) => ItemDocument;
  sourceText?: string;
  sourcePath?: string;
  fvttVersion: FvttTargetVersion;
  effectProfile: EffectProfile;
  iconOptions?: IconWorkflowOptions;
  iconWorkflow?: Pick<IconWorkflowPort, 'createResolutionSession'>;
}

export interface ItemGenerationArtifact {
  stageIndex?: number;
  fileName: string;
  item: ItemDocument;
  diagnostics: GenerationDiagnostic[];
  canonical: CanonicalItemDocument;
  verification: GenerationVerification;
  iconReview: IconReviewReport | null;
}

export async function generateItemArtifacts(
  parsed: ParsedItem,
  options: ItemGenerationWorkflowOptions,
): Promise<ItemGenerationArtifact[]> {
  const expanded = expandParsedItemStages(parsed).filter(entry => options.stageIndex === undefined || entry.stageIndex === options.stageIndex);
  const projector = getGenerationProjector(options.fvttVersion);
  const iconSession = options.iconWorkflow
    ? options.iconWorkflow.createResolutionSession(options.fvttVersion, options.iconOptions)
    : createDisabledIconResolutionSession(options.iconOptions);
  const artifacts: ItemGenerationArtifact[] = [];
  for (const entry of expanded) {
    const reviewStart = iconSession.entries.length;
    const canonical = adaptParsedItemToCanonical(entry.parsed, {
      sourceText: options.sourceText,
      sourcePath: options.sourcePath,
    });
    let item = await projector.project(canonical, {
      ...options,
      targetVersion: options.fvttVersion,
      iconResolver: iconSession.resolver,
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
    let runtimeTarget;
    if (options.nativeProjection) {
      try { item = await projectNativeDocument(options.nativeProjection, 'Item', options.nativeSourceNormalizer?.(item)??item); runtimeTarget = options.nativeProjection.target; }
      catch (error) { entry.diagnostics.push({code:'NATIVE_PROJECTION_INCOMPLETE',severity:'warning',stage:'schema',path:'item',
        message:error instanceof Error?error.message:String(error)}); }
    }
    const verification = verifyGeneratedDocument({
      runtimeTarget,
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
    const stageIconEntries = iconSession.entries.slice(reviewStart);
    const completeIconReview = iconSession.report();
    artifacts.push({
      stageIndex: entry.stageIndex,
      fileName: `${item.name}.json`,
      item,
      diagnostics: verification.diagnostics,
      canonical,
      verification,
      iconReview: completeIconReview
        ? {
            ...completeIconReview,
            entries: completeIconReview.entries.filter((reviewEntry) =>
              stageIconEntries.includes(reviewEntry)),
            summary: summarizeIconEntries(stageIconEntries),
          }
        : null,
    });
  }
  return artifacts;
}

function summarizeIconEntries(entries: NonNullable<ItemGenerationArtifact['iconReview']>['entries']) {
  return {
    total: entries.length,
    override: entries.filter((entry) => entry.source === 'override').length,
    existing: entries.filter((entry) => entry.source === 'existing').length,
    exact: entries.filter((entry) => entry.source === 'compendium-exact').length,
    semantic: entries.filter((entry) => entry.source === 'semantic').length,
    fallback: entries.filter((entry) => entry.source === 'type-default').length,
  };
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

  if (parsed.stagePreamble !== undefined) {
    return expandSourceItemStages(parsed, parsed.stages);
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
    const suffix = stageIndex === 0 ? '' : ` ${stage.name}`;
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

function expandSourceItemStages(parsed: ParsedItem, stages: ItemStage[]): ExpandedStage[] {
  let uses = parsed.uses;
  let acBonus: number | undefined;
  const descriptions = [parsed.stagePreamble];
  const baseActions = parsed.structuredActions;
  const baseEffects = baseActions?.effects?.filter(action => action.passiveEffect?.type !== 'acBonus') ?? [];
  const activities = [...(baseActions?.uses ?? [])];
  return stages.map((stage, stageIndex) => {
    if (stage.maxUses !== undefined) {
      uses = { max: String(stage.maxUses), spent: 0, recovery: uses?.recovery ?? [] };
    }
    acBonus = stage.acBonus ?? acBonus;
    activities.push(...(stage.actions?.uses ?? []));
    descriptions.push(stage.description);
    const effects = [...baseEffects];
    const stageShield = parsed.armor?.baseItem === 'shield' && acBonus !== undefined
      ? { ...parsed.armor, magicalBonus: acBonus }
      : undefined;
    if (acBonus !== undefined && !stageShield) {
      effects.push({
        name: `护甲等级加值 Armor Class Bonus +${acBonus}`,
        type: 'effect',
        passiveEffect: { type: 'acBonus', value: acBonus },
      });
    } else if (!stageShield) {
      effects.push(...(baseActions?.effects?.filter(action => action.passiveEffect?.type === 'acBonus') ?? []));
    }
    const rawEnglish = parsed.englishName;
    const baseName = rawEnglish && parsed.name.endsWith(rawEnglish) ? parsed.name.slice(0, -rawEnglish.length).trim() : parsed.name;
    const englishName = rawEnglish && stage.englishName ? `${rawEnglish} — ${stage.englishName}` : rawEnglish;
    const currentValues = [
      uses ? `充能上限 ${uses.max}` : '',
      acBonus === undefined ? '' : `护甲等级 +${acBonus}`,
    ].filter(Boolean);
    const heading = `当前阶段：${stage.name}${currentValues.length ? `。 ${currentValues.join('，')}。` : '。'}`;
    return {
      stage,
      stageIndex,
      sourceMechanicsPresent: true,
      diagnostics: [],
      parsed: {
        ...parsed,
        name: `${baseName}·${stage.name}`,
        englishName,
        description: [heading, ...descriptions].filter(Boolean).join('\n\n'),
        cumulativeRequirements: undefined,
        stages: [stage],
        uses,
        ...(stageShield ? { armor: stageShield, unresolvedMechanics: undefined } : {}),
        structuredActions: { ...baseActions, effects, uses: [...activities] },
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
