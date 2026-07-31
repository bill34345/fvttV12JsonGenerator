/**
 * Browser-safe Web composition surface.
 *
 * Keep client imports isolated from Node-only server adapters so Vite never
 * needs to rely on tree-shaking to protect the browser bundle boundary.
 */
export {
  hasCompleteNormalizedCropRect,
  type ImageTokenCrop,
} from '@fvtt-json-generator/assets-icons/token-crop';
