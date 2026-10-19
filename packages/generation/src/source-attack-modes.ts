import {sourceAttackDamageModes} from '@fvtt-json-generator/models/source-operations';
import type {SourceOperation} from '@fvtt-json-generator/models/source-operations';
import {createStableDocumentId} from './stableId';

/** Project only source-verified, mutually exclusive rolls. Does not watch HP,
 * run scripts or borrow system-library attack/damage numbers. */
export function applySourceAttackDamageModes(item:any,source:string,ops:SourceOperation[],name:string,path:string,format:(part:any)=>any):void{
 const modes=sourceAttackDamageModes(source,ops,name);if(!modes)return;
 const activities=Object.values(item.system.activities) as any[],parents=activities.filter(a=>a.flags?.fvttJsonGenerator?.sourceOperation?.id===modes.attackId),attack=ops.find(op=>op.id===modes.attackId)!.attack!;
 if(!parents.length)throw Error('MissingSourceAttackModeParent');
 const absorbed=new Set(modes.absorbedIds);
 for(const a of activities)if(absorbed.has(a.flags?.fvttJsonGenerator?.sourceOperation?.id))delete item.system.activities[a._id];
 if(modes.kind==='versatile'){
  item.type='weapon';item.system.type={value:modes.weapon.category,baseItem:modes.weapon.baseItem};
  item.system.properties=['ver',...(attack.range!==undefined?['thr']:[])];
  item.system.damage={base:format(modes.ordinary),versatile:format(modes.alternative)};
  item.system.range={value:attack.range??null,long:attack.longRange??null,reach:attack.reach??null,units:'ft'};
  item.system.quantity=1;item.system.equipped=true;item.system.identified=true;item.system.proficient=0;
  const primary=parents[0];
  primary.name=ops.find(op=>op.id===modes.attackId)!.name;
  // The one native Attack can choose one/two hands and, where source-explicit,
  // Thrown. "none" is dnd5e's native no-ability mode, so printed fixed totals
  // cannot acquire another STR/DEX modifier, including on extra damage.
  primary.attack.ability='none';primary.attack.type.value=attack.range!==undefined?'':'melee';
  primary.range={override:false,units:'ft',special:''};
  primary.damage={...primary.damage,includeBase:true,parts:modes.shared.map(format)};
  primary.flags.fvttJsonGenerator.sourceOperation.damageMode='versatile';
  for(const duplicate of parents.slice(1))delete item.system.activities[duplicate._id];
 }else{
  for(const parent of parents){
   parent.name+='（普通伤害）';parent.damage={...parent.damage,includeBase:false,parts:[modes.ordinary,...modes.shared].map(format)};
   parent.flags.fvttJsonGenerator.sourceOperation.damageMode='ordinary';
   const alternative=structuredClone(parent);alternative._id=createStableDocumentId({kind:'activity',path:path+'/source-operation/'+modes.attackId+'/replacement/'+parent._id});
   alternative.name=parent.name.replace(/（普通伤害）$/u,'（替代伤害）');alternative.damage.parts=[modes.alternative,...modes.shared].map(format);
   alternative.flags.fvttJsonGenerator.sourceOperation.damageMode='alternative';item.system.activities[alternative._id]=alternative;
  }
 }
}
