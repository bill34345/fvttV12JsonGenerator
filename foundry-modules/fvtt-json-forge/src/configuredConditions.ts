import { decodeConfiguredConditionCatalog, configuredConditionFingerprint, type ConfiguredConditionDefinition } from '@fvtt-json-generator/contracts/configured-conditions';
import { nativeLifecycleStatusLabel } from '@fvtt-json-generator/contracts/status-lifecycle';

/** Public module boundary only; Forge never imports the condition module implementation. */
export function configuredConditionsCatalog(game: any): ConfiguredConditionDefinition[] {
  const module = game?.modules?.get?.('fvtt-custom-conditions');
  if (!module?.active || !module.api?.configuredConditions) return [];
  const api = module.api.configuredConditions;
  if (api.version !== 1 || typeof api.catalog !== 'function') throw new Error('自定义状态目录接口不兼容，请更新 Custom Conditions。');
  return decodeConfiguredConditionCatalog(api.catalog());
}
export function configuredConditionsApi(game: any, definition?: ConfiguredConditionDefinition): any {
  const module = game?.modules?.get?.('fvtt-custom-conditions');
  const api = module?.api?.configuredConditions;
  if (!module?.active || api?.version !== 1 || ['catalog', 'apply', 'list', 'remove'].some(method => typeof api[method] !== 'function')) {
    throw new Error('此能力需要启用支持可配置状态的 Custom Conditions。');
  }
  if (definition) {
    const current = configuredConditionsCatalog(game).find(entry => entry.id === definition.id);
    if (!current || configuredConditionFingerprint(current) !== configuredConditionFingerprint(definition)) {
      throw new Error(`自定义状态 ${definition.name} 已缺失或定义发生变化，请重新生成并审核能力连接。`);
    }
  }
  return api;
}
export function configuredConditionSummary(definition: ConfiguredConditionDefinition): string {
  return definition.components.map(component => component.kind === 'movement-reduction'
    ? `移动速度降低 ${component.feet} 尺` : component.kind === 'native-condition' ? nativeLifecycleStatusLabel(component.status)
      : `状态机制 ${component.conditionId}`).join('；');
}
