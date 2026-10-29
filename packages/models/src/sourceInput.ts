type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
const numeric = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value)
  ? value : typeof value === 'string' && /^[+-]?\d+(?:\.\d+)?$/u.test(value.trim()) ? Number(value) : undefined;
const abilities = ['str','dex','con','int','wis','cha'];
const statuses = ['dead','blinded','charmed','deafened','exhaustion','frightened','grappled','incapacitated','invisible','paralyzed','petrified','poisoned','prone','restrained','stunned','unconscious'];
const damageTypes=new Set(['acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder','强酸','酸蚀','钝击','冷冻','寒冷','火焰','力场','闪电','黯蚀','死灵','暗蚀','穿刺','毒素','毒性','心灵','光耀','挥砍','雷鸣']);
const missingHealingRecipient='治疗目标未提供，请按完整原文确认对象、数量与范围。';

/** Preserve an unprojected field beside its own ability, without discarding
 * the ability's other rolls. The existing review proposal retains raw data. */
function retainField(feature: RecordValue, path: string, value: unknown, message: string, appendSourceNote = true, code = 'FIELD_PROJECTION_INCOMPLETE'): void {
  const prior = object(feature.candidateReview) ? feature.candidateReview : undefined;
  const findings = Array.isArray(prior?.findings) ? prior.findings : [];
  if (findings.some(entry => object(entry) && entry.path === path && entry.code === code)) return;
  feature.candidateReview = {version:1, findings:[...findings,{code,path,message}],
    proposal:{prior:prior?.proposal??null,field:path,value:structuredClone(value)}};
  if(!appendSourceNote)return;
  const key = typeof feature.description === 'string' ? 'description' : typeof feature['描述'] === 'string' ? '描述' : 'description';
  feature[key] = [feature[key],`GM：${message} 原始字段 ${path}：${JSON.stringify(value)}`].filter(Boolean).join('\n\n');
}

function projectDamage(feature:RecordValue,value:unknown,path:string):unknown[] {
  const entries=Array.isArray(value)?value:object(value)||typeof value==='string'?[value]:[];
  if(!entries.length&&value!==undefined&&(!Array.isArray(value)||value.length))retainField(feature,path,value,'伤害字段尚未形成可操作伤害段；其他操作保留。');
  return entries.flatMap((entry,index)=>{
    const part:RecordValue|undefined=typeof entry==='string'?{formula:entry,type:'',relationship:'base'}:object(entry)?{...entry}:undefined;
    const formula=part?.formula??part?.['公式'];
    if(!part||(typeof formula!=='string'&&typeof formula!=='number')||!String(formula).trim()){
      retainField(feature,`${path}/${index}`,entry,'此伤害段尚不能转换；其余伤害段保留。');return [];
    }
    part.formula=String(formula);const type=part.type??part['类型'];part.type=typeof type==='string'?type:'';
    if(type!==undefined&&type!==''&&!damageTypes.has(String(type).trim().toLowerCase().replace(/\s+damage$/u,''))){retainField(feature,`${path}/${index}/type`,type,'此伤害类型由GM按原始字段结算；伤害量保留。');part.type='';if(Object.hasOwn(part,'类型'))part['类型']='';}
    if(part.relationship===undefined&&part['关系']!==undefined)part.relationship=part['关系'];
    if(part.condition===undefined&&part['条件']!==undefined)part.condition=part['条件'];
    if(part.relationship!==undefined&&!['base','additional','conditional','replacement'].includes(String(part.relationship))){retainField(feature,`${path}/${index}/relationship`,part.relationship,'此伤害关系由GM选择，单独保留伤害按钮，不自动加入主伤害。');part.condition=typeof part.condition==='string'?part.condition:'GM 伤害关系：'+JSON.stringify(part.relationship);part.relationship='conditional';if(Object.hasOwn(part,'关系'))part['关系']='conditional';}
    else if(part.relationship===undefined)part.relationship=index?'additional':'base';
    if(part.condition!==undefined&&typeof part.condition!=='string'){retainField(feature,`${path}/${index}/condition`,part.condition,'此伤害条件按原始字段由GM处理。');delete part.condition;}
    if(part.types!==undefined&&!Array.isArray(part.types)){retainField(feature,`${path}/${index}/types`,part.types,'伤害类型选项按原始字段由GM处理。');delete part.types;}
    if(Array.isArray(part.types))part.types=part.types.filter((type,typeIndex)=>{if(typeof type==='string'&&damageTypes.has(type.trim().toLowerCase().replace(/\s+damage$/u,'')))return true;retainField(feature,`${path}/${index}/types/${typeIndex}`,type,'此可选伤害类型由GM按原始字段处理。');return false;});
    return [part];
  });
}

function projectHealing(feature:RecordValue,value:unknown,path:string):RecordValue|undefined {
  if(!object(value)){retainField(feature,path,value,'此治疗字段尚不能转换；其他操作保留。');return;}
  const next={...value},formula=next.formula??next['公式'],kind=next.type??next['类型'];
  if((typeof formula!=='string'&&typeof formula!=='number')||!String(formula).trim()){retainField(feature,path,value,'此治疗量尚不能转换；其他操作保留。');return;}
  next.formula=String(formula);next.type=kind==='治疗'?'healing':kind==='临时生命值'?'temphp':kind;if(next['类型']!==undefined)next['类型']=next.type;
  if(!['healing','temphp'].includes(String(next.type))){retainField(feature,path+'/type',kind,'治疗种类按原始字段由GM处理。');return;}
  if(next.target===undefined){
    retainField(feature,path==='治疗'?'healing/target':path+'/target',null,missingHealingRecipient,true,'HEALING_TARGET_UNSPECIFIED');
    return next;
  }
  if(!object(next.target)){retainField(feature,path+'/target',next.target,'治疗对象按原始字段由GM选择。');next.target={type:'any',special:''};}
  else next.target={...next.target};
  const target=next.target as RecordValue;
  if(!['self','creature','any'].includes(String(target.type))){retainField(feature,path+'/target/type',target.type,'治疗对象种类按原始字段由GM选择。');target.type='any';}
  if(target.count!==undefined){const count=numeric(target.count);if(count!==undefined&&count>0)target.count=count;else{retainField(feature,path+'/target/count',target.count,'治疗对象数量由GM选择，不附加原生人数限制。');delete target.count;}}
  if(target.special!==undefined&&typeof target.special!=='string'){retainField(feature,path+'/target/special',target.special,'此目标限制按原始字段由GM处理。');target.special=JSON.stringify(target.special);}
  for(const key of Object.keys(target))if(!['type','count','special'].includes(key))retainField(feature,path+'/target/'+key,target[key],'此治疗目标附注按原始字段由GM处理。');
  return next;
}

function projectSourceOperations(feature:RecordValue):void {
  const supplied=feature.sourceOperations;
  if(supplied===undefined)return;
  const operations=Array.isArray(supplied)?supplied:object(supplied)?[supplied]:[];
  if(!operations.length){if(supplied!==null&&(!Array.isArray(supplied)||supplied.length))retainField(feature,'sourceOperations',supplied,'操作字段尚不能转换；其他明确操作保留。');delete feature.sourceOperations;return;}
  feature.sourceOperations=operations.flatMap((entry,index)=>{
    const at=`sourceOperations/${index}`;
    if(!object(entry)){retainField(feature,at,entry,'此操作尚不能转换；同能力的其他操作保留。');return [];}
    const op={...entry};
    if(op.proof!==undefined&&!object(op.proof))retainField(feature,at+'/proof',op.proof,'此引文附注尚未映射；明确机制继续生成。');
    if(op.proof===undefined||!object(op.proof))op.proof={};
    if(op.damage!==undefined)op.damage=projectDamage(feature,op.damage,at+'/damage');
    for(const kind of ['attack','save','healing'] as const){
      const value=op[kind];if(value===undefined)continue;
      if(!object(value)){retainField(feature,at+'/'+kind,value,'此局部字段尚不能转换；伤害及其他操作保留。');delete op[kind];continue;}
      const next={...value};op[kind]=next;
      if(kind==='attack'){
        const hit=numeric(next.toHit);
        if(hit===undefined){retainField(feature,at+'/attack',value,'命中修正尚不能转换；已知伤害保留为独立掷骰。');delete op.attack;continue;}
        next.toHit=hit;
        if(!['mwak','rwak','msak','rsak','melee','ranged','unclassified'].includes(String(next.type))){retainField(feature,at+'/attack/type',next.type,'攻击分类未能映射；保留GM通用攻击检定。');next.type='unclassified';}
        for(const key of ['reach','range','longRange'])if(next[key]!==undefined){const n=numeric(next[key]);if(n!==undefined&&n>=0)next[key]=n;else{retainField(feature,at+'/attack/'+key,next[key],'此距离按原始字段由GM处理。');delete next[key];}}
      }else if(kind==='save'){
        const dc=numeric(next.dc),list=Array.isArray(next.abilities)?next.abilities:typeof next.ability==='string'?[next.ability]:[];
        const known=list.filter(a=>abilities.includes(String(a)));
        if(dc===undefined||!known.length){retainField(feature,at+'/save',value,'此豁免字段尚不能转换；伤害及其他操作保留。');delete op.save;continue;}
        for(const [abilityIndex,ability]of list.entries())if(!abilities.includes(String(ability)))retainField(feature,at+'/save/abilities/'+abilityIndex,ability,'此豁免属性由GM按原始字段处理。');
        next.dc=dc;next.abilities=[...new Set(known)];
        if(next.choice===undefined&&known.length===1)next.choice='single';
        else if(next.choice!=='target'&&(next.choice!=='single'||known.length>1))retainField(feature,at+'/save/choice',value,'豁免关系未明确；各属性提供独立GM按钮，不自动设为目标二选一。');
        if(!['none','half','full'].includes(String(next.outcome)))next.outcome='none';
      }else{
        const projected=projectHealing(feature,value,at+'/healing');
        if(projected){
          if(projected.target===undefined){
            projected.target={type:'any',special:'GM：'+missingHealingRecipient};
          }
          op.healing=projected;
        }else delete op.healing;
      }
    }
    if(Array.isArray(op.failureStatuses)&&!op.failureStatuses.length)delete op.failureStatuses;
    else if(Array.isArray(op.failureStatuses))op.failureStatuses=projectStatuses(feature,op.failureStatuses,at+'/failureStatuses');
    if(Array.isArray(op.appliedConditions))for(const[conditionIndex,condition]of op.appliedConditions.entries())if(object(condition))normalizeAppliedCondition(feature,condition,at+'/appliedConditions/'+conditionIndex);
    for(const key of ['range'] as const)if(op[key]!==undefined){const n=numeric(op[key]);if(n!==undefined)op[key]=n;else{retainField(feature,at+'/'+key,op[key],'此距离按原始字段由GM处理。');delete op[key];}}
    if(op.aoe!==undefined&&(!object(op.aoe)||numeric(op.aoe.radius)===undefined)){retainField(feature,at+'/aoe',op.aoe,'此范围按原始字段由GM处理。');delete op.aoe;}
    if(op.condition!==undefined&&typeof op.condition!=='string'){retainField(feature,at+'/condition',op.condition,'此条件按原始字段由GM处理。');delete op.condition;}
    const kinds=[...(op.attack?['attack']:[]),...(op.save?['save']:[]),...(op.healing?['heal']:[])];
    if(Array.isArray(op.damage)&&op.damage.length&&(op.type==='damage'||op.type==='heal'))kinds.push('damage');
    if(!kinds.length&&Array.isArray(op.damage)&&op.damage.length)kinds.push('damage');
    if(!kinds.length){retainField(feature,at,entry,'此操作尚不能生成原生按钮；完整操作资料保留。');return [];}
    const primary=kinds.includes(String(op.type))?String(op.type):kinds[0]!;
    return [primary,...kinds.filter(kind=>kind!==primary)].map((kind,partIndex)=>{
      const result:RecordValue={...op,type:kind,name:typeof op.name==='string'&&op.name.trim()?op.name:String(feature.name??feature['名称']??`操作 ${index+1}`),
        relationship:partIndex?'follow-up':['primary','follow-up','alternative'].includes(String(op.relationship))?op.relationship:index?'follow-up':'primary'};
      if(kind!=='attack')delete result.attack;if(kind!=='save')delete result.save;if(kind!=='heal')delete result.healing;
      if(kind!==(primary==='heal'?'damage':primary))delete result.damage;
      if(partIndex)result.id=`${String(op.id??`operation-${index+1}`)}-${kind}`;
      if(kind==='save'&&object(result.save)&&Array.isArray(result.save.abilities)&&result.save.abilities.length>1&&result.save.choice!=='target'){
        const save=result.save;return (save.abilities as unknown[]).map((ability,abilityIndex)=>({...result,id:String(result.id??`operation-${index+1}`)+'-save-'+abilityIndex,name:String(result.name)+' '+String(ability).toUpperCase(),save:{...save,abilities:[ability],choice:'single'}}));
      }
      return [result];
    }).flat();
  });
  if(!(feature.sourceOperations as unknown[]).length)delete feature.sourceOperations;
}

function normalizeAppliedCondition(feature:RecordValue,condition:RecordValue,path:string):void{
  normalizeOptionalSourceText(condition,['condition','duration']);
  for(const key of ['exhaustionLevels','力竭级数'])if(condition[key]!==undefined){
    const level=numeric(condition[key]);if(level!==undefined&&Number.isSafeInteger(level)&&level>0)condition[key]=level;
    else{retainField(feature,path+'/'+key,condition[key],'此力竭级数由DM按原始值选择，状态模板保留。');delete condition[key];}
  }
}

function projectStatuses(feature:RecordValue,values:unknown[],path:string):unknown[]{
  const seen=new Set<string>();
  return values.filter((status,index)=>{if(statuses.includes(String(status))&&!seen.has(String(status))){seen.add(String(status));return true;}retainField(feature,path+'/'+index,status,seen.has(String(status))?'重复状态保留在原始记录中，原生状态只连接一次。':'此状态名称尚未映射到原生状态，原始状态与规则保留。');return false;});
}

function projectGmFields(feature:RecordValue):void {
  if(feature.sourceContext!==undefined&&(!Array.isArray(feature.sourceContext)||feature.sourceContext.some(value=>typeof value!=='string'))){
    retainField(feature,'sourceContext',feature.sourceContext,'补充上下文按原始资料由GM处理。');
    feature.sourceContext=Array.isArray(feature.sourceContext)?feature.sourceContext.filter(value=>typeof value==='string'):[];
  }
  if(feature.spellUseRecords!==undefined){
    const records=Array.isArray(feature.spellUseRecords)?feature.spellUseRecords:[];
    feature.spellUseRecords=records.filter((record,index)=>{
      if(object(record)&&typeof record.name==='string'&&Number.isInteger(numeric(record.max))&&Number(numeric(record.max))>0&&record.period==='day'){record.max=numeric(record.max);return true;}
      retainField(feature,'spellUseRecords/'+index,record,'此法术次数记录按原始字段由GM记录。');return false;
    });
    if(!(feature.spellUseRecords as unknown[]).length)delete feature.spellUseRecords;
  }
  if(feature.gmTriggeredSave!==undefined){
    const save=feature.gmTriggeredSave;
    if(object(save)&&numeric(save.dc)!==undefined&&abilities.includes(String(save.ability))){
      save.dc=numeric(save.dc);save.failureStatuses=Array.isArray(save.failureStatuses)?projectStatuses(feature,save.failureStatuses,'gmTriggeredSave/failureStatuses'):[];
      if(typeof save.trigger!=='string')save.trigger='';if(typeof save.sourceText!=='string')save.sourceText=String(feature.description??feature['描述']??'');
    }else{retainField(feature,'gmTriggeredSave',save,'此触发豁免按原始字段由GM处理；攻击和伤害保留。');delete feature.gmTriggeredSave;}
  }
  if(feature.nativeFailureStatuses!==undefined){
    const value=feature.nativeFailureStatuses;
    if(Array.isArray(value)&&!value.length)delete feature.nativeFailureStatuses;
    else if(Array.isArray(value)&&(feature.save!==undefined||feature.DC!==undefined))feature.nativeFailureStatuses=projectStatuses(feature,value,'nativeFailureStatuses');
    else{retainField(feature,'nativeFailureStatuses',value,'此状态的适用与解除由GM依原文处理。');delete feature.nativeFailureStatuses;}
  }
}

/** Optional presentation has no meaning when blank; nonempty source text and
 * invalid types remain untouched for the normal contract checks. */
export function normalizeOptionalSourceText(record: RecordValue, keys: readonly string[]): void {
  for (const key of keys) if (typeof record[key] === 'string' && !(record[key] as string).trim()) delete record[key];
}

export function isHealingRecipient(record: RecordValue): boolean {
  return (record.type === 'self' || record.type === 'creature' || record.type==='any') && (record.count===undefined||typeof record.count==='number'&&Number.isFinite(record.count)&&record.count>0)
    && (record.special === undefined || typeof record.special === 'string');
}

function normalizeHealingInput(value: unknown): void {
  if (!object(value) || !object(value.target)) return;
  if (value.target.special === undefined) value.target.special = '';
}

function normalizeDamageInput(value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const part of value) if (object(part)) {
    normalizeOptionalSourceText(part, ['condition']);
    if (Array.isArray(part.types) && part.types.length === 0) delete part.types;
  }
}

/** The caller owns this decoded record. No values or rules are read from prose. */
export function normalizeCreatureFeatureInput(feature: RecordValue, description: unknown): void {
  projectSourceOperations(feature);
  projectGmFields(feature);
  for(const key of ['healing','治疗'])if(feature[key]!==undefined){const healing=projectHealing(feature,feature[key],key);if(healing)feature[key]=healing;else delete feature[key];}
  for(const key of ['damage','伤害'])if(feature[key]!==undefined)feature[key]=projectDamage(feature,feature[key],key);
  description=feature.description??feature['描述']??description;
  if(feature.executionMode===undefined&&feature['执行模式']===undefined&&['spellUseRecords','gmTriggeredSave','nativeFailureStatuses'].some(key=>feature[key]!==undefined&&(!Array.isArray(feature[key])||(feature[key] as unknown[]).length>0))){
    feature.executionMode='native-with-gm';feature.nativeRuleText??=String(description??'');feature.manualRemainder??=String(description??'');
  }
  normalizeOptionalSourceText(feature, ['englishName', 'sourceQualifier', 'activationCondition', 'targetSpecial']);
  normalizeHealingInput(feature.healing);
  normalizeHealingInput(feature['治疗']);
  if (object(feature.save)) normalizeOptionalSourceText(feature.save, ['condition']);
  normalizeDamageInput(feature.damage);
  for(const key of ['appliedConditions','内嵌效果'])if(Array.isArray(feature[key]))for(const[index,condition]of (feature[key] as unknown[]).entries())if(object(condition))normalizeAppliedCondition(feature,condition,key+'/'+index);
  if (Array.isArray(feature.spellUseRecords) && feature.spellUseRecords.length === 0) delete feature.spellUseRecords;
  const operations = Array.isArray(feature.sourceOperations);
  if (feature.executionMode === 'gm-manual' || operations) {
    for (const key of ['damage', 'appliedConditions', 'nativeFailureStatuses']) if (Array.isArray(feature[key]) && feature[key].length === 0) delete feature[key];
  } else if (feature.executionMode !== 'native-with-gm' && Array.isArray(feature.nativeFailureStatuses) && feature.nativeFailureStatuses.length === 0) delete feature.nativeFailureStatuses;
  if (!Array.isArray(feature.sourceOperations)) return;
  normalizeOptionalSourceText(feature, ['executionMode', 'activityType']);
  const ids = new Set(feature.sourceOperations.flatMap(op => object(op) && typeof op.id === 'string' ? [op.id] : []));
  const seenIds=new Set<string>();
  for (const [index, op] of feature.sourceOperations.entries()) {
    if (!object(op)) continue;
    if (typeof op.id!=='string'||!op.id.trim()||seenIds.has(op.id)) {
      if(op.id!==undefined)retainField(feature,`sourceOperations/${index}/id`,op.id,'此技术标识已由程序重分配；全部操作保留。');
      const base = `operation-${index + 1}`; let id = base, suffix = 1;
      while (ids.has(id)) id = `${base}-${++suffix}`;
      op.id = id; ids.add(id);
    }
    seenIds.add(op.id as string);
    normalizeOptionalSourceText(op, ['condition', 'targetSpecial']);
    if (op.type !== 'save' && Array.isArray(op.failureStatuses) && op.failureStatuses.length === 0) delete op.failureStatuses;
    normalizeHealingInput(op.healing);
    if (op.proof === undefined) op.proof = {};
    if (object(op.proof)) {
      normalizeOptionalSourceText(op.proof, ['attack', 'save', 'healing', 'range', 'aoe', 'target']);
      if (Array.isArray(op.proof.damage) && op.proof.damage.length === 0) delete op.proof.damage;
    }
    normalizeDamageInput(op.damage);
    if (typeof description === 'string' && description.trim()) {
      if (op.sourceText === undefined || typeof op.sourceText === 'string' && !op.sourceText.trim()) op.sourceText = description.trim();
    }
  }
  if (typeof description !== 'string' || !description.trim()) return;
  normalizeOptionalSourceText(feature, ['nativeRuleText', 'manualRemainder']);
  if (feature.sourceOperations.length && feature.executionMode !== undefined && feature.executionMode !== 'native-with-gm') {
    retainField(feature,'executionMode',feature.executionMode,'明确操作保持可执行；与操作冲突的执行模式仅作审阅记录。',false);
    feature.executionMode = 'native-with-gm';
  } else if (feature.executionMode === undefined) feature.executionMode = 'native-with-gm';
  if (feature.activityType === undefined) feature.activityType = 'utility';
  if (feature.nativeRuleText === undefined) feature.nativeRuleText = description;
  if (feature.manualRemainder === undefined) feature.manualRemainder = description;
}
