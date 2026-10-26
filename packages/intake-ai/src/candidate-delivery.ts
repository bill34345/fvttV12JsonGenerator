import type {IntakeFinding, MonsterIntakeIR} from './types';

/** Compatibility export. Delivery preserves the proposal; validation belongs
 * to the input boundary, and conversion errors never authorize data removal. */
export function prepareMonsterCandidateDelivery(original:MonsterIntakeIR,_source:string,_literal=false):{ir:MonsterIntakeIR;findings:IntakeFinding[]}{
  return{ir:structuredClone(original),findings:[]};
}
