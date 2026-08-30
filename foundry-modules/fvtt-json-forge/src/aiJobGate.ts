import { BROWSER_MAX_CONCURRENT_ACTOR_JOBS } from '@fvtt-json-generator/forge-browser-runtime';

const activeAiOwners = new Set<object>();

export function claimForgeAiJob(owner: object): boolean {
  if (activeAiOwners.has(owner)) return true;
  if (activeAiOwners.size >= BROWSER_MAX_CONCURRENT_ACTOR_JOBS) return false;
  activeAiOwners.add(owner);
  return true;
}

export function releaseForgeAiJob(owner: object): void {
  activeAiOwners.delete(owner);
}
