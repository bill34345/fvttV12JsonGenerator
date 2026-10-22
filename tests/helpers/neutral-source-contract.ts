import {strict as assert} from 'node:assert';
import {sourceNeutralAttackKind} from '@fvtt-json-generator/models/source-operations';

/** Explicit new-contract test input, never a normalization of a frozen reply.
 * Only attack.type changes; source quotes, numbers, modes and conditions stay
 * byte-for-byte equivalent to the archived operations. Callers separately
 * assert that the original guessed weapon classification is rejected. */
export function newNeutralAttackContractVariant(operations:readonly any[],kind:'melee'|'ranged'):any[]{
  const variant=structuredClone([...operations]),legacyType=kind==='melee'?'mwak':'rwak';
  let changes=0;
  for(const op of variant){
    if(op.type!=='attack')continue;
    assert.equal(op.attack?.type,legacyType,'Expected the explicit archived weapon-classification contract');
    assert.equal(sourceNeutralAttackKind(op.proof?.attack??''),kind,'The source must explicitly print this unclassified attack kind');
    op.attack.type=kind;changes++;
  }
  assert.ok(changes>0,'A new-contract variant must change at least one explicitly selected attack');
  return variant;
}
