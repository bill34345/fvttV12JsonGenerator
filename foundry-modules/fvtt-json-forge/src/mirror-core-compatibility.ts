import { isVersionInMajor } from '@fvtt-json-generator/contracts/version-admission';
import { isNativeForgeRuntimeTargetSupported } from '@fvtt-json-generator/forge-browser-runtime';

/** Runtime admission is separate from the exact source and artifact identities. */
export { isForgeRuntimeTargetSupported } from '@fvtt-json-generator/forge-browser-runtime';
export function isForgeCoreVersionSupported(value: unknown): value is string {
  return isVersionInMajor(value, '14.368');
}

/** Target binding is separate from the caller's runtime and GM checks. */
export function isForgeAutomationTargetCompatible(game:any,target:any):boolean{
  if(!target)return false;
  if(game.system?.id!=='dnd5e'||target.system!=='dnd5e'||target.effectProfile!=='core')return false;
  if(isNativeForgeRuntimeTargetSupported(game.version,game.system.version)
    &&isNativeForgeRuntimeTargetSupported(target.foundry,target.systemVersion))
    return true;
  return false;
}
