export interface ImageTokenCrop {
  left: number;
  top: number;
  width: number;
  height: number;
  fit?: 'cover' | 'contain';
}

export type CompleteNormalizedCropRect = Pick<ImageTokenCrop, 'left' | 'top' | 'width' | 'height'>;

export function hasCompleteNormalizedCropRect(
  value: Partial<ImageTokenCrop>,
): value is Partial<ImageTokenCrop> & CompleteNormalizedCropRect {
  return (['left', 'top', 'width', 'height'] as const).every((field) => {
    const coordinate = value[field];
    return typeof coordinate === 'number'
      && Number.isFinite(coordinate)
      && coordinate >= 0
      && coordinate <= 1;
  });
}
