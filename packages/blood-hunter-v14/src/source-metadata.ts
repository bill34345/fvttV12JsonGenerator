/** Read-only source identity contract for offline operator adapters.
 * This entry has no compiler, migration runner, filesystem or Foundry operations.
 */
export {
  assertBloodHunterSourceBytes,
  collectBloodHunterFeatures,
  validateBloodHunterEnrichedSource,
} from './source';
export type { CollectedBloodHunterFeature } from './source';
