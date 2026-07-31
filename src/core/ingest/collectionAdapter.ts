import type { CollectionIngestionPort } from '@fvtt-json-generator/workflows/external-ports';
import {
  parseCreatureBlock,
  splitCollection,
} from '@fvtt-json-generator/ingest-plaintext/plaintext';
import { splitItemCollection } from './items';

export const collectionIngestionAdapter: CollectionIngestionPort = {
  splitMonsterCollection: splitCollection,
  parseMonsterBlock: parseCreatureBlock,
  splitItemCollection,
};
