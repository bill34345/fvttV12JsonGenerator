import {materializeSourceOperationEvidence,materializeStructuredSourceOperations,sourceOperationErrors} from '@fvtt-json-generator/models/source-operations';
import {SOURCE_FEATURE_COLLECTIONS,sourceFeatureIdentity,sourceResourcePoolIdentity} from '@fvtt-json-generator/models/source-resource-pools';
import type {MonsterIntakeIR} from './types';
import {completeSourceFeatureEvidence,completeSourceSpellcastingEvidence} from './source-completeness';
import {bindSourceGroupComponents} from './staged-spellcasting';
import {sha256} from '@fvtt-json-generator/contracts/hash';

/** Shared by complete-IR extract/repair and staged feature extraction. */
export const SOURCE_AREA_SHAPE_CONTRACT=`For every area carrier, an explicitly printed Emanation uses aoe.shape:radius; a Sphere uses sphere. Follow the CHM 2024 glossary for Chinese source text: 光环 means Emanation and uses radius; 球状 means Sphere and uses sphere. For example, 源自炎魔的30尺光环区域 and 源自炎魔5尺 光环 区域 use radius with their printed sizes 30 and 5; 周围15尺光环区域 also uses radius. 半径20尺的黄色恶心气体云团球状区域 uses sphere with size 20, not radius. Whitespace or line wrapping around Chinese glossary terms does not change their meaning. 半径 alone is a dimension, not proof of an Emanation. Both draw circles in Foundry, but radius enables Token-size adjustment and is not interchangeable with sphere. Preserve the exact printed distance, origin and proof. Never infer an Emanation from an ability name containing Aura or from a generic circular area. A name containing 光环 or 灵光 also supplies no area geometry. For a legacy sphere value whose own complete rule/proof uniquely prints an equal-distance Emanation or 光环, the native representation is radius; the original IR stays unchanged. Do not change a genuine Sphere or 球状, an ambiguous mixed-geometry proof, a negated area's existence, a mismatched distance, damage or another field. Apply this representation rule when comparing the IR with native Actor data.`;
export const SOURCE_OPERATION_CONTRACT=`A complete ability may contain sourceOperations:[OP,...], with executionMode:native-with-gm and activityType:utility. Preserve all basic operations even when later consequences remain GM-owned.
${SOURCE_AREA_SHAPE_CONTRACT}
For a standalone Damage roll triggered at the start/end of a turn or by an event, use damage[].relationship:conditional. The only/first OP may remain relationship:primary; conditional does not require an earlier Attack or Save. Keep the complete event/timing sentence in proof.damage and explicitly set condition to the complete trigger/timing text. This is an independently clicked GM roll, not automatic damage. For Chinese source, 回合开始/回合结束 and 当/若/每当 retain the same distinction.
Inventory the WHOLE parent ability, including later sentences. If an initial Save is followed by recurring fixed-dice damage and a later conditional Save, retain all three operations in source order: initial Save primary, recurring Damage follow-up with conditional damage, and later Save follow-up. Later checks may belong to the source creature itself rather than the first target; keep that subject and the complete trigger in their own proof. Neither complete manualRemainder prose nor complex status/possession/regurgitation consequences can replace these basic buttons. Never attach later recurring damage to the initial Save, reuse its DC for a later Save, guess range from an expulsion distance, consume the initial action/resource again, or automate the trigger/state lifecycle.
OP is {id:string,name:string,type:attack|save|damage|heal,relationship:primary|follow-up|alternative,condition?:EXACT_TRIGGER_OR_CONDITION,attack?:{type:mwak|rwak|msak|rsak|melee|ranged,toHit:number,reach?:number,range?:number,longRange?:number},save?:{dc:number,abilities:[str|dex|con|int|wis|cha],choice:single|target,outcome:none|half|full},damage?:[{formula:string,type:CANONICAL_DAMAGE_TYPE,types?:[CANONICAL_DAMAGE_TYPE,...],relationship:base|additional|conditional|replacement}],healing?:{formula:string,type:healing|temphp,target:{type:self|creature,count:1,special:EXACT_SOURCE_QUALIFICATION}},range?:number,aoe?:{shape:sphere|radius|cone|line|cube|cylinder|rectangle,radius:number,width?:number,height?:number},targetSpecial?:EXACT_SOURCE_TARGET_LIMITATION,failureStatuses?:[SUPPORTED_NATIVE_STATUS,...],proof:{attack?:string,save?:string,damage?:string[],healing?:string,range?:string,aoe?:string,target?:string}}.
Attack classification comes from the printed header: explicit Melee/Ranged Weapon Attack uses mwak/rwak; explicit Melee/Ranged Spell Attack uses msak/rsak. A modern "Melee Attack Roll" without Weapon or Spell MUST use melee; "Ranged Attack Roll" without either MUST use ranged. A natural-weapon name, damage type or creature identity never supplies the missing classification. The neutral types retain labelled GM attack and damage rolls, not a guessed native Weapon/Spell Attack. Source-explicit Line width uses aoe.width and Cylinder height uses aoe.height; no other shapes accept these fields and missing dimensions are not guessed.
Neutral melee/ranged attacks MUST be represented inside sourceOperations. The outer legacy feature.attack carrier cannot project an unclassified attack. Do not put melee/ranged on that outer field or duplicate its attack/damage facts outside the SourceOP; keep the complete source parent and use the existing SourceOP attack-roll plus GM damage projection.
Healing OP support is bounded: retain two explicitly printed healing events in one complete parent, first for You or one creature you touch, then For the duration for that same recipient at the start/end of each of its/your turns. Preserve BOTH exact formulas, healing/temporary-HP kinds, single-recipient qualifications and complete proof.healing sentences; the first is primary and the second follow-up. An initial spell-header sentence must remain complete in its proof. Do not mix other OP kinds into this bounded healing carrier, combine amounts, omit the later heal, invent a flat range from Touch, add a use pool, or automate turns/expiry/body-part restoration. You supply the follow-up condition; the program copies complete sourceText/evidence as citation metadata. Unsupported healing shapes remain unresolved, not guessed.
For each Heal OP, target.special is the COMPLETE healing result sentence with its recipient and timing, not a bare subject such as "the target". For an initial spell-header proof, special starts at the recipient/healing clause and omits only the preceding spell metadata; proof.healing retains that metadata. For the follow-up, special retains the complete "For the duration" sentence. A single fixed healing event uses the existing flat healing fields, not a one-element Heal sourceOperations array.
OMIT sourceText, evidence and offsets on OP: the program only binds the complete parent description and citation coordinates. You supply condition for every triggered, conditional or follow-up operation. For a Save, supply failureStatuses only for directly applied native states you intend to create; supported states are dead,blinded,charmed,deafened,frightened,grappled,incapacitated,invisible,paralyzed,petrified,poisoned,prone,restrained,stunned,unconscious. Keep timed/staged or otherwise unrepresented consequences as complete GM prose. The program does not infer statuses or triggers from that prose. Each proof string must quote the COMPLETE original sentence with all conditions and punctuation; wrapping and Markdown presentation alone may be aligned back to it. Never quote a clipped formula-only fragment. Keep ft. inside its sentence. Printed totals are final values; fixed damage is a numeric formula string. One exclusive damage-type choice is ONE roll with types and type equal to the first type.
Proof dependencies: attack requires proof.attack, save requires proof.save, each damage part requires its corresponding proof.damage sentence, range requires proof.range, aoe requires proof.aoe, and targetSpecial requires proof.target. proof.damage must be parallel to damage, including repeated complete sentences when multiple parts share one sentence; it cannot omit another sentence, conditional/replacement scope or outcome branch. When targetSpecial is printed in the Attack sentence, repeat that COMPLETE sentence as proof.target. Supply target proof explicitly; no missing mechanic or target proof is inferred by the program.
Prefer ordinary Hit damage on the Attack OP itself. A separately printed unconditional Hit damage roll may also be its own follow-up damage OP, invoked by GM without paying the activation again. This does not turn it into extra automatic damage.
When one complete Attack header prints exactly one default bonus immediately followed by one parenthetical conditional bonus, such as +2 to hit (+4 to hit with shillelagh), retain BOTH Attack helpers: the default primary immediately followed by an alternative at the conditional bonus, with condition equal to the exact printed with/while/if/when fragment. Both quote the same COMPLETE header and target sentence, and share type/reach/range/target. This bounded exception changes only the bonus; multiple conditional bonuses or a parenthesis changing distance/target remain unresolved. Do not use the conditional bonus unconditionally or hide the second helper. These are independently selected GM buttons; separate ordinary/two-handed/magical damage buttons are not automatically paired with either Attack and must keep clear source labels.
For ordinary Save damage with success none/half/full, put the failed-save damage ON THAT SAVE operation and set save.outcome to the printed SUCCESS result. Do not detach it into an unconditional follow-up Damage. Example source: Each creature must make a DC 13 Dexterity saving throw. Failure: 9 (2d8) acid damage. Success: Half damage.
Example Save OP: {"id":"save","name":"Saving Throw","type":"save","relationship":"primary","save":{"dc":13,"abilities":["dex"],"choice":"single","outcome":"half"},"damage":[{"formula":"2d8","type":"acid","relationship":"base"}],"proof":{"save":"Each creature must make a DC 13 Dexterity saving throw.","damage":["Failure: 9 (2d8) acid damage."]}}
If a result branch truly requires a separate GM Damage button, that Damage part is conditional and its complete branch remains visible; Failure/Success damage is never unconditional base on an independent Damage OP. A valid JSON response may still need source repair. Do not rewrite articles, pronouns or any other words inside verbatim descriptions/evidence to match an example.
Retain all source damage parts, reach/ranges, area geometry and target restrictions. Movement before a Save does not establish its range. The complete parent rule and shared conditions remain visible at every button; the GM decides timing, eligibility and unusual consequences.
Evidence belongs to this complete ability and its supplied shared preamble. sourceInventory identifies existing abilities and explicit shared-pool members; it does NOT authorize copying another ability's attack bonus, damage, DC, range or proof. A separate complete rule may explicitly increase the fixed extra damage of a named chosen option. Keep both complete original parents and the original conditional base operation; do not manufacture a second damage button, combine quotes, change the original proof, infer a class level/selected option, or emit proof.upgrade. Represent only supported explicit values; retain additional upgrades as complete GM prose when this closed schema has no field for them. If this ability only says to make/use an existing named attack without printing those mechanics here, preserve that exact reference for the GM to trigger the already generated named button. Do not manufacture another Attack OP from sourceInventory. Such a reference has no newly printed basic roll to extract. If the same ability also prints independent basic operations, retain those operations and leave only the referenced-button consequence for GM.
For example, "If the attacker is within reach, the creature can make one Spear attack against it" refers the GM to the existing Spear ability. It supplies no new attack bonus or damage proof. In a FEATURE response with only this reference and other GM consequences, manual/facts:{} is valid; a response with invented or borrowed OP fields remains invalid and is never automatically erased into manual.
Example source: Melee Weapon Attack: +5 to hit, reach 5 ft., one creature. Hit: 5 (1d6+2) piercing damage.
Example OP: {"id":"attack","name":"Attack","type":"attack","relationship":"primary","attack":{"type":"mwak","toHit":5,"reach":5},"targetSpecial":"one creature","damage":[{"formula":"1d6+2","type":"piercing","relationship":"base"}],"proof":{"attack":"Melee Weapon Attack: +5 to hit, reach 5 ft., one creature.","target":"Melee Weapon Attack: +5 to hit, reach 5 ft., one creature.","damage":["Hit: 5 (1d6+2) piercing damage."]}}
Put operations in source order. Only the first may be primary; a source-explicit delayed check may instead begin with a GM follow-up. A limited-use feature must retain its primary operation. Saves after attacks are follow-up, invoked separately by GM without another resource cost. OR target choices, including reverse-order Intelligence or Wisdom Saving Throw: (Target’s Choice) DC 15, use all source abilities in ONE Save with choice:target; AND requires distinct Saves, with later checks as GM follow-ups without another cost. alternative requires an explicit source OR between distinct operations or an Alternatively sentence introducer; an OR damage type or attribute choice is not evidence for independent alternative operations. Conditional/replacement damage MUST use its own GM-operated damage OP, never a part on Attack or Save. Save.outcome describes SUCCESS. Explicit Failure/Success labels and inline result introducers apply across sentences until another branch/operation; do not merge successful damage into failure. If success cannot map exactly to none/half/full, retain the Save without damage and supply separately conditioned GM damage operations for the complete branches. A later lifetime/end/repeat condition cannot become an indefinite Effect. Spells use the existing portable manifest, never Utility or OP placeholders. No automatic trigger graph, arbitrary scripts, Effects or raw Foundry paths are allowed. Complete prose cannot replace explicit supported attack, damage or Save buttons.`;

// Documentation data only. Compute exact UTF-16 spans so the prompt's complete
// group/claim/coverage example cannot teach inconsistent evidence coordinates.
const sharedPoolExample=(()=>{
  const source='Spellcasting. The creature casts the following spells, using Wisdom as its spellcasting ability.\nShared 1/day: Light, Alarm\nShared 2/day: Blur, Invisibility\nAt Will: Mage Hand';
  const ref=(quote:string)=>({start:source.indexOf(quote),end:source.indexOf(quote)+quote.length,quote});
  const spell=(name:string)=>({refId:name.toLowerCase().replace(/ /gu,'-'),identifier:name.toLowerCase().replace(/ /gu,'-'),originalName:name,englishName:name,aliases:[],restrictions:[],evidence:[ref(name)]});
  const common={description:source,evidence:[ref(source)],ability:'wis',abilityEvidence:[ref('using Wisdom as its spellcasting ability')],componentWaivers:[]};
  const spellcasting=[{...common,groupId:'casting-pool-one',featureName:'Spellcasting',usageGroups:[{usage:'daily-shared',count:1,evidence:[ref('Shared 1/day: Light, Alarm')],spellRefs:[spell('Light'),spell('Alarm')]},{usage:'at-will',evidence:[ref('At Will: Mage Hand')],spellRefs:[spell('Mage Hand')]}]},
    {...common,groupId:'casting-pool-two',featureName:'Spellcasting (Shared 2/day)',usageGroups:[{usage:'daily-shared',count:2,evidence:[ref('Shared 2/day: Blur, Invisibility')],spellRefs:[spell('Blur'),spell('Invisibility')]}]}];
  const paths=spellcasting.map((_,index)=>'/creature/spellcasting/'+index);
  return`EXAMPLE_SOURCE_JSON: ${JSON.stringify(source)}\nEXAMPLE_IR_FRAGMENT_JSON: ${JSON.stringify({creature:{spellcasting},claims:paths.map(path=>({path,valueKind:'explicit',confidence:'high',evidence:[ref(source)]})),coverage:[{...ref(source),classification:'mechanical',claimPaths:paths}]})}`;
})();

export const FULL_IR_SOURCE_OPERATION_CONTRACT=`${SOURCE_OPERATION_CONTRACT}
For sourceOperations, omit ALL old flat executable fields, including attack/save/damage/healing/aoe/range/targetSpecial/appliedConditions/gmTriggeredSave/nativeFailureStatuses. Area, placement range and target restrictions belong to the exact OP that uses them, with their own complete proof. Do not duplicate them on the carrier. Retain the complete literal feature description and exact parent evidence; use executionMode:native-with-gm,activityType:utility. The program supplies nativeRuleText/manualRemainder from the description and binds OP source evidence; do not calculate OP offsets. Unsupported consequences such as timed prevention of regaining hit points remain complete GM prose, never an invented appliedConditions status. If repair identifies an unsupported automatic field, remove only that field and retain its full consequence and timing in the original description; do not remove valid OPs or change their basic rolls.
Flat attack plus flat save generates only the Attack button. An ability with an attack followed by a Save MUST use separate sourceOperations, or an already supported and exactly source-proven gmTriggeredSave contract. Merely populating feature.save does not preserve that follow-up. A repeat Save that ends a condition keeps its exact separate timing and is not an initial attack Save.
Explicit named NON-SPELL shared pools use creature.sourceResourcePools:[{max:number,period:day|longRest|shortRest|dawn,members:[{collection:traits|actions|bonusActions|reactions|legendaryActions|mythicActions,index:number,cost:1},...],evidence:[EXACT_SHARING_SENTENCE_REF]}]. Retain each member's explicit uses. Give each member its complete feature-index claim and mechanical coverage or feature.evidence; you select membership, amount and recovery. Omit program-owned pool id/name/member featureId. The renderer creates ONE shared pool through existing fixed native consumption. Do not infer sharing from equal counts, similar names or proximity. Declare any uncertainty yourself; the program does not reconstruct missing membership or counts from source text.
Independent SPELL shared rows require separate casting groups with distinct groupId AND featureName keys, even when printed inside the same source ability. Each group has at most ONE daily-shared usageGroup. Keep the complete original block as each group's identical description/evidence, but assign every grant row and spell exactly once. At-will/independent grants may stay with the first group. Add an evidence-backed /creature/spellcasting/N claim for EVERY group; one mechanical coverage span may reference all those claims without duplicating source coverage. In repair, fix missing group claims/coverage while preserving independent pools; never merge different counts into one feature counter. Do not duplicate spells or infer pools from names.
The following complete fragment illustrates two independent spell pools plus at-will, their exact absolute evidence (the sample source begins at0), per-group claims and shared source coverage. Apply the structure to the actual source and offsets; do not copy these sample spells or counts.
${sharedPoolExample}`;

const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const stable=(value:unknown):string|undefined=>JSON.stringify(value,(_key,entry)=>object(entry)?Object.fromEntries(Object.keys(entry).sort().map(key=>[key,entry[key]])):entry);
// A refusal boundary for redundant placement only, not an interpreter that
// moves conditional rules onto a primary operation.
const placementQualifier=/\b(?:if|unless|while|whenever|when|after|before|only|instead|provided|at the (?:start|end))\b|如果|若|当|每当|之后|之前|除非|仅当|改为|代替|回合(?:开始|结束)/iu;

/** Ordinary providers may repeat an OP's area/placement metadata on its
 * carrier. Fold only an exact unique unconditional primary mirror after the
 * whole parent and every OP have independently passed source validation.
 * Explicit child claims remain untouched (including wrong evidence), so no
 * audit owner is swallowed or left pointing at a removed carrier field. */
function foldRedundantOperationPlacement(source:string,ir:MonsterIntakeIR,feature:MonsterIntakeIR['creature']['actions'][number],path:string,range:{start:number;end:number}):void{
  const parent=completeSourceFeatureEvidence(source,ir,feature,path,range),ops=feature.sourceOperations;
  if(!parent||!Array.isArray(ops)||sourceOperationErrors(feature.description,ops).length||feature.activationCondition!==undefined||feature.sourceContext!==undefined)return;
  if(ops.some(op=>!op.evidence||!Number.isSafeInteger(op.evidence.start)||!Number.isSafeInteger(op.evidence.end)
    ||op.evidence.start<parent.start||op.evidence.end>parent.end||op.evidence.quote!==op.sourceText||source.slice(op.evidence.start,op.evidence.end)!==op.sourceText))return;
  for(const field of ['aoe','range','targetSpecial'] as const){
    if(feature[field]===undefined)continue;
    const child=path+'/'+field,ownsChild=(value:unknown)=>typeof value==='string'&&(value===child||value.startsWith(child+'/'));
    if(ir.claims.some(claim=>ownsChild(claim?.path))||ir.coverage.some(entry=>Array.isArray(entry?.claimPaths)&&entry.claimPaths.some(ownsChild)))continue;
    const owners=ops.filter(op=>op[field]!==undefined);
    if(owners.length!==1)continue;
    const owner=owners[0]!,main=owner.type==='attack'?owner.proof.attack:owner.type==='save'?owner.proof.save:owner.proof.damage?.[0],proof=field==='targetSpecial'?owner.proof.target:owner.proof[field];
    if(!main||!proof||placementQualifier.test(feature.description.slice(0,feature.description.indexOf(main))+main+' '+proof))continue;
    if(owner.relationship==='primary'&&owner.condition===undefined&&stable(feature[field])===stable(owner[field]))delete feature[field];
  }
}

/** Source normalization is not semantic repair: program-owned spans, stable
 * IDs and claims are materialized; only independently proven redundant
 * placement metadata is folded. Conflicting proposals remain for validation. */
export function bindProviderSourceContracts(source:string,value:Record<string,unknown>,range={start:0,end:source.length}):void{
  const ir=value as unknown as MonsterIntakeIR,creature=ir.creature;
  if(!object(creature))return;
  for(const collection of SOURCE_FEATURE_COLLECTIONS){
    const features=creature[collection];if(!Array.isArray(features))continue;
    for(const feature of features){
      if(!object(feature)||!Array.isArray(feature.sourceOperations)||typeof feature.description!=='string')continue;
      const parent=Array.isArray(feature.evidence)?feature.evidence.find(ref=>object(ref)&&Number.isSafeInteger(ref.start)&&source.slice(ref.start,ref.end)===ref.quote&&ref.quote.includes(feature.description)):undefined;
      const offset=parent?parent.start+parent.quote.indexOf(feature.description):undefined;
      feature.sourceOperations=materializeStructuredSourceOperations(feature.description,feature.sourceOperations,offset) as typeof feature.sourceOperations;
      feature.executionMode??='native-with-gm';feature.activityType??='utility';
      feature.nativeRuleText??=feature.description;feature.manualRemainder??=feature.description;
    }
  }
  // IDs join already declared structured members; they never infer a pool,
  // a member, a resource amount or a rule from the original text.
  if(Array.isArray(creature.sourceResourcePools))for(const pool of creature.sourceResourcePools){
    if(!object(pool)||!Array.isArray(pool.members))continue;
    for(const member of pool.members){
      if(!object(member)||!SOURCE_FEATURE_COLLECTIONS.includes(member.collection)||!Number.isSafeInteger(member.index))continue;
      const feature=creature[member.collection as typeof SOURCE_FEATURE_COLLECTIONS[number]]?.[member.index];
      if(!feature)continue;
      const technicalId=sha256(`${ir.source?.sha256}:${member.collection}:${member.index}`).slice(0,16);
      member.featureId??=feature.sourceFeatureId??technicalId;
      feature.sourceFeatureId??=member.featureId;
    }
    if(pool.members.every(member=>object(member)&&typeof member.featureId==='string'))pool.id??=sourceResourcePoolIdentity(ir.source.sha256,pool.members.map(member=>member.featureId));
    pool.name??='Shared uses';
  }
}

/** Explicit legacy source audit only. Never called by default AI intake. */
export function bindProviderSourceAuditContracts(source:string,value:Record<string,unknown>,range={start:0,end:source.length}):void{
  const ir=value as unknown as MonsterIntakeIR,creature=ir.creature;
  if(!object(creature))return;
  if(Array.isArray(creature.spellcasting))creature.spellcasting.forEach((group,index)=>{if(!object(group))return;const parent=completeSourceSpellcastingEvidence(source,ir,group,'/creature/spellcasting/'+index,range);if(parent)bindSourceGroupComponents(source,parent,group);});
  for(const collection of SOURCE_FEATURE_COLLECTIONS){
    const features=creature[collection];if(!Array.isArray(features))continue;
    features.forEach((feature,index)=>{
      if(!object(feature)||!Array.isArray(feature.sourceOperations)||typeof feature.description!=='string')return;
      const path=`/creature/${collection}/${index}`;
      if(feature.evidence===undefined){const parent=completeSourceFeatureEvidence(source,ir,feature,path,range);if(parent)feature.evidence=[parent];}
      const refs=feature.evidence;
      if(!Array.isArray(refs))return;
      const parent=refs.find(ref=>object(ref)&&Number.isSafeInteger(ref.start)&&source.slice(ref.start,ref.end)===ref.quote&&ref.quote.includes(feature.description));
      if(!parent)return;
      // Provider IR is a proposal; the shared validator decides acceptance.
      feature.sourceOperations=materializeSourceOperationEvidence(feature.description,feature.sourceOperations,parent.start+parent.quote.indexOf(feature.description)) as typeof feature.sourceOperations;
      feature.executionMode??='native-with-gm';feature.activityType??='utility';
      feature.nativeRuleText??=feature.description;feature.manualRemainder??=feature.description;
      feature.evidence??=refs;
      foldRedundantOperationPlacement(source,ir,feature,path,range);
    });
  }
  if(!Array.isArray(creature.sourceResourcePools))return;
  creature.sourceResourcePools.forEach((pool,index)=>{
    if(!object(pool)||!Array.isArray(pool.members))return;
    const evidence=Array.isArray(pool.evidence)?[...pool.evidence]:[];let allMembersBound=true;
    for(const member of pool.members){
      if(!object(member)||!SOURCE_FEATURE_COLLECTIONS.includes(member.collection)||!Number.isSafeInteger(member.index)){allMembersBound=false;continue;}
      const feature=creature[member.collection as typeof SOURCE_FEATURE_COLLECTIONS[number]]?.[member.index],path=`/creature/${member.collection}/${member.index}`;
      const parent=feature&&completeSourceFeatureEvidence(source,ir,feature,path,range);
      if(feature&&feature.evidence===undefined&&parent)feature.evidence=[parent];
      const ref=feature?.evidence?.[0];
      if(!feature||!parent||!ref||source.slice(ref.start,ref.end)!==ref.quote||!ref.quote.includes(feature.description)){allMembersBound=false;continue;}
      const id=sourceFeatureIdentity(ir.source.sha256,ref);feature.sourceFeatureId??=id;member.featureId??=id;
      if(feature.sourceFeatureId!==id||member.featureId!==id)allMembersBound=false;
      if(!evidence.some(actual=>actual.start===ref.start&&actual.end===ref.end))evidence.push(ref);
    }
    if(!pool.evidence)return;
    pool.evidence=evidence;
    if(allMembersBound)pool.id??=sourceResourcePoolIdentity(ir.source.sha256,pool.members.map(member=>member.featureId));
    pool.name??='Source shared uses';
    const path=`/creature/sourceResourcePools/${index}`;
    if(Array.isArray(ir.claims)&&!ir.claims.some(claim=>claim.path===path))ir.claims.push({path,valueKind:'preserved-literal',confidence:'high',evidence});
    if(Array.isArray(ir.coverage))for(const entry of ir.coverage)if(evidence.some(ref=>entry.start<=ref.start&&entry.end>=ref.end)&&!entry.claimPaths.includes(path))entry.claimPaths.push(path);
  });
}
