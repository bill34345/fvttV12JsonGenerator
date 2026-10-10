import { CONDITION_DEFINITIONS, createConditionInstance, isConditionId, type ConditionId, type ConditionParams } from './conditions';
import { sha256 } from './hash';
import { NATIVE_LIFECYCLE_STATUS_DEFINITIONS } from './native-lifecycle-catalog';

/** User-authored definitions contain selections of implemented mechanisms, never commands or effect paths. */
export type ConfiguredConditionComponent =
  | { kind: 'builtin-condition'; conditionId: ConditionId; params: ConditionParams }
  | { kind: 'native-condition'; status: keyof typeof NATIVE_LIFECYCLE_STATUS_DEFINITIONS }
  | { kind: 'movement-reduction'; feet: number };
export interface ConfiguredConditionDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  aliases: string[];
  components: ConfiguredConditionComponent[];
}
export interface ConfiguredConditionReference { id: string; fingerprint: string }

function record(value: unknown, keys: string[]): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Configured condition must contain plain data.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length || Reflect.ownKeys(descriptors).some(key =>
    typeof key !== 'string' || !keys.includes(key) || !descriptors[key]?.enumerable || !('value' in descriptors[key]!))) {
    throw new TypeError('Configured condition contains missing or unsupported fields.');
  }
  return value as Record<string, any>;
}
function text(value: unknown, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || /[\u0000-\u001f<>]/u.test(value)) {
    throw new TypeError('Configured condition text is invalid.');
  }
  return value.trim();
}
function dataArray(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < min || value.length > max) throw new TypeError('Invalid configured condition array.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) throw new TypeError('Configured condition arrays must be dense plain data.');
  const output: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new TypeError('Configured condition arrays must be dense plain data.');
    output.push(descriptor.value);
  }
  return output;
}
export function decodeConfiguredConditionDefinition(value: unknown): ConfiguredConditionDefinition {
  const data = record(value, ['schemaVersion', 'id', 'name', 'description', 'aliases', 'components']);
  if (data.schemaVersion !== 1 || typeof data.id !== 'string' || !/^configured\.[a-z][a-z0-9-]{0,63}$/u.test(data.id)) {
    throw new TypeError('Configured condition requires a stable configured.* ID and schemaVersion 1.');
  }
  const name = text(data.name, 120), description = text(data.description, 2000, true);
  const aliases = dataArray(data.aliases, 1, 12).map(alias => text(alias, 100));
  const reserved = new Set<string>([...Object.values(NATIVE_LIFECYCLE_STATUS_DEFINITIONS).flatMap(definition => [...definition.sourceNames]),
    ...Object.values(CONDITION_DEFINITIONS).flatMap(definition => [definition.id, definition.label])].map(name => name.toLocaleLowerCase('en-US')));
  if ([name,...aliases].some(alias => reserved.has(alias.toLocaleLowerCase('en-US')))) throw new TypeError('Configured source names must not replace native or built-in conditions.');
  if (new Set(aliases.map(alias => alias.toLocaleLowerCase('en-US'))).size !== aliases.length) throw new TypeError('Duplicate configured condition aliases.');
  const components: ConfiguredConditionComponent[] = dataArray(data.components, 1, 8).map(value => {
    if (!value || typeof value !== 'object') throw new TypeError('Invalid condition mechanism.');
    const kind = Object.getOwnPropertyDescriptor(value, 'kind');
    if (!kind || !('value' in kind)) throw new TypeError('Condition mechanisms must be plain data.');
    if (kind.value === 'movement-reduction') {
      const component = record(value, ['kind', 'feet']);
      if (!Number.isInteger(component.feet) || component.feet < 1 || component.feet > 100) throw new TypeError('Movement reduction must be 1–100 feet.');
      return { kind: 'movement-reduction', feet: component.feet };
    }
    if (kind.value === 'native-condition') {
      const component = record(value, ['kind', 'status']);
      if (typeof component.status !== 'string' || !Object.hasOwn(NATIVE_LIFECYCLE_STATUS_DEFINITIONS, component.status)) throw new TypeError('Unknown native condition mechanism.');
      return { kind: 'native-condition', status: component.status as keyof typeof NATIVE_LIFECYCLE_STATUS_DEFINITIONS };
    }
    const component = record(value, ['kind', 'conditionId', 'params']);
    if (component.kind !== 'builtin-condition' || !isConditionId(component.conditionId)) throw new TypeError('Unknown condition mechanism.');
    const parameters = CONDITION_DEFINITIONS[component.conditionId].parameters.map(parameter => parameter.id);
    if (!component.params || typeof component.params !== 'object' || Array.isArray(component.params)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(component.params))) throw new TypeError('Condition parameters must be plain data.');
    const descriptors = Object.getOwnPropertyDescriptors(component.params);
    if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !parameters.includes(key)
      || !descriptors[key]?.enumerable || !('value' in descriptors[key]!))) throw new TypeError('Unsupported condition parameter.');
    const normalized = createConditionInstance(component.conditionId, component.params, { instanceId: 'definition-validation' });
    return { kind: 'builtin-condition', conditionId: component.conditionId, params: normalized.params };
  });
  if (components.filter(component => component.kind === 'movement-reduction').length > 1
    || new Set(components.filter(component => component.kind === 'native-condition').map(component => component.status)).size
      !== components.filter(component => component.kind === 'native-condition').length
    || new Set(components.filter(component => component.kind === 'builtin-condition').map(component => component.conditionId)).size
      !== components.filter(component => component.kind === 'builtin-condition').length) throw new TypeError('Do not repeat the same mechanism within one condition.');
  return { schemaVersion: 1, id: data.id, name, description, aliases, components };
}
export function configuredConditionFingerprint(value: ConfiguredConditionDefinition): string {
  const definition = decodeConfiguredConditionDefinition(value);
  return sha256(JSON.stringify(definition));
}
export function decodeConfiguredConditionCatalog(value: unknown): ConfiguredConditionDefinition[] {
  const definitions = dataArray(value, 0, 100).map(decodeConfiguredConditionDefinition);
  const ids = new Set<string>(), aliases = new Set<string>();
  for (const definition of definitions) {
    if (ids.has(definition.id)) throw new TypeError('Duplicate configured condition ID.');
    ids.add(definition.id);
    for (const alias of new Set([definition.name, ...definition.aliases].map(name => name.toLocaleLowerCase('en-US')))) {
      const key = alias.toLocaleLowerCase('en-US');
      if (aliases.has(key)) throw new TypeError('Ambiguous configured condition source name.');
      aliases.add(key);
    }
  }
  return definitions;
}
