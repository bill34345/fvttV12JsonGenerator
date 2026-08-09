import { planNativeBloodHunterMigration, compileBloodHunterV14Package } from '../../../packages/blood-hunter-v14/src/index.ts';
import { makeBloodHunter2024Fixture } from '../../../packages/blood-hunter-v14/tests/fixture.ts';
import { clone, normalizeName } from '../src/migration.ts';
import type { ActorLike, MigrationContract, RuntimeDocument } from '../src/contracts.ts';
import type { NativeBloodHunterPackage } from '../../../packages/blood-hunter-v14/src/index.ts';

export function fixturePackage(): NativeBloodHunterPackage {
  return compileBloodHunterV14Package(makeBloodHunter2024Fixture());
}

export function fixtureContract(pkg = fixturePackage()): MigrationContract {
  const mergePolicy = planNativeBloodHunterMigration(pkg, []).mergePolicy;
  const documents = [...pkg.classes, ...pkg.subclasses, ...pkg.features].map((document) => clone(document) as unknown as RuntimeDocument);
  const fixedGrantDocumentIds = [...new Set(pkg.grantGraph
    .filter((node) => node.type === 'ItemGrant')
    .flatMap((node) => node.references.map((reference) => reference.targetDocumentId)))].sort();
  return {
    schemaVersion: 1,
    moduleId: 'fvtt-blood-hunter-2024',
    version: '1.0.0',
    target: { foundry: '14.364', dnd5e: '5.3.3', rules: '2024', effectProfile: 'modded-v14' },
    logicalHash: pkg.logicalHash,
    documents,
    fixedGrantDocumentIds,
    rootDocumentIds: documents.filter((document) => document.type === 'class' || document.type === 'subclass').map((document) => document._id).sort(),
    mergePolicy,
    externalDnd5eUuids: [],
    activityCount: documents.reduce((total, document) => total + Object.keys(document.system.activities ?? {}).length, 0),
  };
}

export function dawnTarget(contract: MigrationContract): RuntimeDocument {
  const target = contract.documents.find((document) => Object.keys(document.system.activities ?? {}).length === 5 && document.effects.length === 2);
  if (!target) throw new Error('Fixture does not contain the Dawn target document.');
  return target;
}

export function callumFixtureActor(contract: MigrationContract): { actor: ActorLike; dawnId: string; nonBloodHunterId: string } {
  const target = dawnTarget(contract);
  const identity = (target.flags as any).fvttJsonGenerator.bloodHunter2024.sourceIdentity as Record<string, unknown>;
  const oldDawn = clone(target) as RuntimeDocument & { legacyIdentity?: Record<string, unknown> };
  oldDawn._id = 'callum-dawn00001';
  oldDawn.name = 'Rite of the Dawn';
  oldDawn.flags = {};
  oldDawn.legacyIdentity = {
    source: 'BloodHunter2024',
    name: oldDawn.name,
    className: identity.className,
    subclassShortName: identity.subclassShortName,
    level: identity.level,
  };
  oldDawn.system.activities = {};
  oldDawn.effects = [];
  const nonBloodHunter = {
    _id: 'callum-other0001',
    name: 'A non-Blood-Hunter item',
    type: 'feat',
    system: { description: { value: 'Keep this exactly.' } },
    effects: [],
    flags: { customModule: { keep: true } },
  } as RuntimeDocument;
  const actor: ActorLike = {
    _id: 'callum-actor0001',
    name: 'Callum',
    system: { attributes: { hp: { value: 17, max: 24 } }, levels: 8 },
    ownership: { default: 3 },
    items: [oldDawn, nonBloodHunter],
  };
  return { actor, dawnId: oldDawn._id, nonBloodHunterId: nonBloodHunter._id };
}

export function normalizedLegacyName(document: RuntimeDocument): string {
  return normalizeName(document.name);
}
