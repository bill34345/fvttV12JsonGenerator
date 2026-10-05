/** Narrow patch to the released DAE 14.0.14 artifact, preserving its phase routing. */
export function patchShouldApplyChange(source) {
  const start = source.indexOf('export function daeShouldApplyChange(');
  const end = source.indexOf('export function daeApplyActiveEffects(', start);
  if (start < 0 || end < 0) throw new Error('DAE released-function anchors missing');
  const section = source.slice(start, end);
  const original = '    return effectivePhase(change, spec, this) === options?.phase;';
  if (section.split(original).length !== 2) throw new Error('DAE phase gate differs from locked release');
  const replacement = [
    '    if (effectivePhase(change, spec, this) !== options?.phase)',
    '        return false;',
    '    // Preserve native suppression, change conditions and the applied marker.',
    '    // DAE chose the real phase above; core compares the stored change phase.',
    '    return wrapped(change, { ...options, phase: change.phase });'
  ].join('\n');
  return source.slice(0, start) + section.replace(original, replacement) + source.slice(end);
}
