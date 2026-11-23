import type { NativeActivity } from './types.ts';

type ActivitySummary = Pick<NativeActivity, 'range' | 'target' | 'duration' | 'labels'>;

export function activityFacts({ range, target, duration, labels }: ActivitySummary): string[] {
  const affects = target?.affects;
  const area = target?.template?.labels?.statblock;
  const isSelf = range?.units === 'self';
  const targets = isSelf && affects?.type === 'self' ? undefined : affects?.labels?.sheet;
  const distance = isSelf
    ? (area || affects?.type === 'self' ? labels?.range : undefined)
    : labels?.range;

  // A bare Activity defaults to self and instantaneous even when only the prose describes its use.
  const time = distance || area || targets || duration?.units !== 'inst'
    ? labels?.concentrationDuration || labels?.duration
    : undefined;
  return [distance, area, targets, time].filter((value): value is string => Boolean(value));
}
