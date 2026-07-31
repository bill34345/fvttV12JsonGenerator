import { processParsedNpcImage } from './imageAssets';
import type { ImageAssetProcessorPort } from '@fvtt-json-generator/workflows/external-ports';

export const imageAssetProcessorAdapter: Readonly<ImageAssetProcessorPort> = Object.freeze({
  process: processParsedNpcImage,
});
