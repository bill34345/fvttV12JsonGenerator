import type { AbilityKey, CanonicalFeature, IntakeFinding, MonsterIntakeIR } from './types';
import { validateMonsterIntakeIR } from './validator';

export interface IntakeVerificationReport {
  schemaVersion: 1;
  status: 'accepted' | 'needs_review';
  findings: IntakeFinding[];
  projection: Record<string, unknown>;
}

export function verifyMonsterIntake(
  source: string,
  ir: MonsterIntakeIR,
  markdown: string,
  actor: unknown,
): IntakeVerificationReport {
  const findings = [...validateMonsterIntakeIR(source, ir).findings];
  const projection = projectActor(actor);
  const add = (code: string, path: string, message: string) => findings.push({
    id: `${code.toLowerCase()}:${path}`.replace(/[^a-z0-9:/_-]+/g, '-'),
    code, path, message, blocking: true, origin: 'semantic',
  });
  const expected = ir.creature;

  const actualName = String(projection.name ?? '');
  if (!actualName.includes(expected.identity.name) || (expected.identity.englishName && !actualName.includes(expected.identity.englishName))) {
    add('ACTOR_NAME_DRIFT', '/creature/identity/name', `Expected actor name to preserve ${expected.identity.name}${expected.identity.englishName ? ` / ${expected.identity.englishName}` : ''}, got ${actualName}.`);
  }
  compare(add, 'ACTOR_AC_DRIFT', '/creature/attributes/ac', expected.attributes.ac, projection.ac);
  compare(add, 'ACTOR_HP_DRIFT', '/creature/attributes/hp/value', expected.attributes.hp.value, projection.hp);
  compare(add, 'ACTOR_HP_FORMULA_DRIFT', '/creature/attributes/hp/formula', compact(expected.attributes.hp.formula), compact(projection.hpFormula));
  compare(add, 'ACTOR_CR_DRIFT', '/creature/attributes/cr', expected.attributes.cr, projection.cr);
  for (const ability of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as AbilityKey[]) {
    compare(add, 'ACTOR_ABILITY_DRIFT', `/creature/abilities/${ability}`, expected.abilities[ability], (projection.abilities as Record<string, unknown>)?.[ability]);
  }
  for (const [kind, value] of Object.entries(expected.attributes.movement)) {
    compare(add, 'ACTOR_MOVEMENT_DRIFT', `/creature/attributes/movement/${kind}`, value, (projection.movement as Record<string, unknown>)?.[kind]);
  }
  compareFeatureSections(add, expected.traits, projection.items, 'traits');
  compareFeatureSections(add, expected.actions, projection.items, 'actions');
  compareFeatureSections(add, expected.bonusActions, projection.items, 'bonusActions');
  compareFeatureSections(add, expected.reactions, projection.items, 'reactions');
  compareFeatureSections(add, expected.legendaryActions, projection.items, 'legendaryActions');

  for (const requiredText of featureDescriptions(expected)) {
    if (!markdown.includes(requiredText)) add('MARKDOWN_DESCRIPTION_LOSS', '/markdown', `Rendered Markdown lost feature text: ${requiredText.slice(0, 80)}`);
  }
  if (markdown.includes('护甲等级: 20') && expected.attributes.ac !== 20) add('TEMPLATE_DEFAULT_LEAK', '/markdown/护甲等级', 'Rendered Markdown contains a conflicting template AC 20.');
  if (markdown.includes('生命值: 332') && expected.attributes.hp.value !== 332) add('TEMPLATE_DEFAULT_LEAK', '/markdown/生命值', 'Rendered Markdown contains a conflicting template HP 332.');

  const deduped = dedupe(findings);
  return { schemaVersion: 1, status: deduped.some((finding) => finding.blocking) ? 'needs_review' : 'accepted', findings: deduped, projection };
}

export function renderIntakeVerificationMarkdown(report: IntakeVerificationReport): string {
  const lines = [
    '# AI 怪物 Intake 确定性核对',
    '',
    `状态：${report.status === 'accepted' ? '通过' : '需要复核'}`,
    `阻断问题：${report.findings.filter((finding) => finding.blocking).length}`,
    '',
  ];
  if (report.findings.length === 0) lines.push('未发现确定性漂移。');
  else for (const finding of report.findings) lines.push(`- [${finding.code}] ${finding.path}：${finding.message}`);
  return `${lines.join('\n')}\n`;
}

export function projectActor(actor: unknown): Record<string, unknown> {
  const root = asRecord(actor);
  const system = asRecord(root.system);
  const attrs = asRecord(system.attributes);
  const details = asRecord(system.details);
  const abilities = asRecord(system.abilities);
  const movement = asRecord(attrs.movement);
  const ac = asRecord(attrs.ac);
  const hp = asRecord(attrs.hp);
  const projectedAbilities: Record<string, unknown> = {};
  for (const key of ['str', 'dex', 'con', 'int', 'wis', 'cha']) projectedAbilities[key] = asRecord(abilities[key]).value;
  const items = Array.isArray(root.items) ? root.items.map((value) => projectItem(value)) : [];
  return {
    name: root.name,
    ac: ac.flat ?? ac.value,
    hp: hp.value,
    hpFormula: hp.formula,
    cr: details.cr,
    abilities: projectedAbilities,
    movement: Object.fromEntries(['walk', 'climb', 'fly', 'swim', 'burrow'].map((key) => [key, movement[key]])),
    items,
  };
}

function projectItem(value: unknown): Record<string, unknown> {
  const item = asRecord(value);
  const system = asRecord(item.system);
  const activation = asRecord(system.activation);
  const description = asRecord(system.description);
  const activities = asRecord(system.activities);
  const firstActivity = asRecord(Object.values(activities)[0]);
  const activityActivation = asRecord(firstActivity.activation);
  const activityDescription = asRecord(firstActivity.description);
  return {
    name: item.name,
    type: item.type,
    activation: activation.type ?? activityActivation.type,
    description: stripHtml(String(description.value ?? activityDescription.chatFlavor ?? '')),
  };
}

function compareFeatureSections(
  add: (code: string, path: string, message: string) => void,
  expected: CanonicalFeature[],
  actorItems: unknown,
  section: string,
): void {
  const items = Array.isArray(actorItems) ? actorItems.map(asRecord) : [];
  const expectedActivation = section === 'actions' ? 'action'
    : section === 'bonusActions' ? 'bonus'
      : section === 'reactions' ? 'reaction'
        : section === 'legendaryActions' ? 'legendary'
          : undefined;
  for (const [index, feature] of expected.entries()) {
    const found = items.find((item) => String(item.name ?? '').includes(feature.name));
    if (!found) {
      add('ACTOR_FEATURE_MISSING', `/creature/${section}/${index}`, `Actor is missing separate feature: ${feature.name}`);
      continue;
    }
    if (expectedActivation && found.activation !== expectedActivation) {
      add('ACTOR_ACTIVATION_DRIFT', `/creature/${section}/${index}`, `${feature.name} activation is ${String(found.activation)}, expected ${expectedActivation}.`);
    }
    const description = String(found.description ?? '');
    const significant = feature.description.replace(/\s+/g, '').slice(0, 24);
    if (significant && !description.replace(/\s+/g, '').includes(significant)) {
      add('ACTOR_DESCRIPTION_LOSS', `/creature/${section}/${index}/description`, `Actor feature lost source description for ${feature.name}.`);
    }
  }
  const matched = expected.filter((feature) => items.some((item) => String(item.name ?? '').includes(feature.name))).length;
  if (matched < expected.length) add('ACTOR_FEATURE_COUNT_DRIFT', `/creature/${section}`, `${section} expected ${expected.length} separate entries but matched ${matched}.`);
}

function featureDescriptions(ir: MonsterIntakeIR['creature']): string[] {
  return [...ir.traits, ...ir.actions, ...ir.bonusActions, ...ir.reactions, ...ir.legendaryActions].map((feature) => feature.description);
}

function compare(
  add: (code: string, path: string, message: string) => void,
  code: string,
  path: string,
  expected: unknown,
  actual: unknown,
): void {
  if (expected === undefined) return;
  if (JSON.stringify(expected) !== JSON.stringify(actual)) add(code, path, `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
}

function compact(value: unknown): string | undefined {
  return typeof value === 'string' ? value.replace(/\s+/g, '') : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function dedupe(findings: IntakeFinding[]): IntakeFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}\0${finding.path}\0${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
