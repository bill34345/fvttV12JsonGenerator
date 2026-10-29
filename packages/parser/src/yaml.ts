import * as yaml from 'js-yaml';
import type {CreatureSize} from '@fvtt-json-generator/models/canonical-monster';
import { FIELD_MAPPING, type ParsedNPC, type FieldDefinition } from './mapping';
import { i18n } from './i18n';
import { CHINESE_ACTION_REGEX } from './chineseActionRegex';
import { StructuredActionParser } from './structuredAction';
import { parseSupportedRuleFacts } from './sourceRuleFacts';
import type { StructuredActionData } from '@fvtt-json-generator/models/action';
import { validateActorSpellManifestStructure } from '@fvtt-json-generator/spell-manifest-contracts/validator';
import {sha256} from '@fvtt-json-generator/contracts/hash';
import { parseActorResourceSemantics } from './resourceSemantics';
import { parseActorBehaviorSemantics } from './behaviorSemantics';
import { validateForgeSourceMetadata } from './forgeSourceMetadata';
import { FORGE_SOURCE_ID_FIELD } from '@fvtt-json-generator/contracts';
import { decodeSourceTextPresentationBoundary,composeSourceTextPresentation } from '@fvtt-json-generator/models/source-text-presentation';
import {isSourceCandidateReview} from '@fvtt-json-generator/models/source-operations';

type YamlBodySectionKey =
  | 'traits'
  | 'actions'
  | 'bonus_actions'
  | 'reactions'
  | 'legendary_actions'
  | 'mythic_actions'
  | 'raw_notes';

type YamlBodyExtractionResult = {
  biography: string;
  traits: string[];
  actions: string[];
  bonus_actions: string[];
  reactions: string[];
  legendary_actions: string[];
  mythic_actions: string[];
};

export class YamlParser {
  private readonly retainedNotes = new WeakMap<ParsedNPC,string[]>();
  public parse(content: string): ParsedNPC {
    const { frontmatter, body } = this.splitContent(content);
    const rawData = yaml.load(frontmatter) as Record<string, any>;
    const literalBiography = rawData && Object.hasOwn(rawData, 'intake-biography-mode');

    const result: ParsedNPC = {
      name: '',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: { bypasses: [] },
      skills: {},
      skillBonuses: {},
      skillPassives: {},
      saves: [],
      saveBonuses: {},
      items: []
    };
    if (literalBiography) result.biographyMode = 'literal';
    try{validateForgeSourceMetadata(rawData);}catch(error){this.retainField(result,FORGE_SOURCE_ID_FIELD,rawData?.[FORGE_SOURCE_ID_FIELD],error);}

    if (body.trim()) {
      const extracted = this.extractBodySections(body);
      const biographyParts = [extracted.biography, ...extracted.traits].filter((part) => part.trim());
      if (biographyParts.length > 0) {
        result.details.biography = biographyParts.join('\n').trim();
      }
      if (extracted.actions.length > 0) {
        result.actions = extracted.actions;
      }
      if (extracted.bonus_actions.length > 0) {
        result.bonus_actions = extracted.bonus_actions;
      }
      if (extracted.reactions.length > 0) {
        result.reactions = extracted.reactions;
      }
      if (extracted.legendary_actions.length > 0) {
        result.legendary_actions = extracted.legendary_actions;
        const first = extracted.legendary_actions[0];
        if (typeof first === 'string') {
          const match =
            first.match(CHINESE_ACTION_REGEX.CHINESE_LEGENDARY_ACTION_COUNT) ??
            first.match(CHINESE_ACTION_REGEX.LEGENDARY_ACTION_COUNT);
          if (match?.[1]) {
            const count = parseInt(match[1]);
            if (!result.attributes.legact) {
              result.attributes.legact = { value: count, max: count };
            }
          }
        }
      }
      if (extracted.mythic_actions.length > 0) {
        result.mythic_actions = extracted.mythic_actions;
      }
    }

    if(rawData&&Object.hasOwn(rawData,'intake-candidate-review')){
      if(isSourceCandidateReview(rawData['intake-candidate-review']))result.candidateReview=structuredClone(rawData['intake-candidate-review']);
      else this.retainField(result,'intake-candidate-review',rawData['intake-candidate-review'],'审阅记录未能读取；Actor内容继续。');
    }
    this.traverse(rawData, result, true);
    if(rawData&&Object.hasOwn(rawData,'intake-legendary-ledger')){
      const ledger=rawData['intake-legendary-ledger'];
      const capacity=(value:unknown,minimum:number)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=minimum;
      if(ledger&&typeof ledger==='object'&&capacity(ledger.max,0)&&capacity(ledger.lairMax,1))result.sourceLegendaryLedger=structuredClone(ledger);
      else this.retainField(result,'intake-legendary-ledger',ledger,'传奇资源附带记录未能转换；已有次数保留。');
    }

    if (rawData && Object.hasOwn(rawData, 'intake-biography-presentation')) {
      try{result.biographyPresentation = decodeSourceTextPresentationBoundary(rawData['intake-biography-presentation'], result.details.biography ?? '');}
      catch(error){this.retainField(result,'intake-biography-presentation',rawData['intake-biography-presentation'],error);}
    }

    if (rawData && typeof rawData === 'object') {
      if ('豁免熟练' in rawData) {
        this.parseSavingThrows((rawData as Record<string, unknown>)['豁免熟练'], result);
      }
      if ('技能' in rawData) {
        const skills = (rawData as Record<string, unknown>)['技能'];
        if (skills && typeof skills === 'object' && !Array.isArray(skills)) {
          this.parseSkills(skills as Record<string, unknown>, result);
        }
      }
      if ('感官' in rawData) {
        const parsedSenses = this.parseSenses((rawData as Record<string, unknown>)['感官']);
        result.traits.senses = parsedSenses.senses;
        if (parsedSenses.passivePerception !== undefined) {
          result.skillPassives = {
            ...(result.skillPassives || {}),
            prc: parsedSenses.passivePerception,
          };
        }
      }
    }

    if (result.details.biography) {
      const facts = parseSupportedRuleFacts(result.details.biography);
      // Literal biography does not create Items or executable mechanics. The
      // closed food-retention fact is display-only and must still share its
      // verified meaning with formal Chinese presentation.
      const displayFacts = result.biographyMode === 'literal' ? facts.filter(fact => fact.kind === 'food-retention') : facts;
      if (displayFacts.length) result.biographyRuleFacts = displayFacts;
    }
    const notes=this.retainedNotes.get(result);
    if(notes?.length){
      if(result.biographyPresentation){
        result.biographyPresentation.programNotes=[[...result.biographyPresentation.programNotes,...notes].join('\n\n')];
        result.details.biography=composeSourceTextPresentation(result.biographyPresentation);
      }else result.details.biography=[result.details.biography,...notes].filter(Boolean).join('\n\n');
    }
    return result;
  }

  private retainField(result:ParsedNPC,key:string,value:unknown,error:unknown):void {
    const message=error instanceof Error?error.message:String(error),prior=result.candidateReview;
    result.candidateReview={version:1,findings:[...(prior?.findings??[]),{code:'FIELD_PROJECTION_INCOMPLETE',path:key,message}],proposal:{prior:prior?.proposal??null,field:key,value}};
    const notes=this.retainedNotes.get(result)??[];
    notes.push(`GM：${message} 原始字段 ${key}：${JSON.stringify(value)}`);this.retainedNotes.set(result,notes);
  }

  private normalizeSpellManifestRecords(manifest:any,result:ParsedNPC):void{
    const groups=Array.isArray(manifest?.spellcastingGroups)?manifest.spellcastingGroups:[],used=new Set<string>();
    if(typeof manifest?.manifestId==='string'&&manifest.manifestId.trim())used.add(manifest.manifestId);
    const id=(owner:any,key:string,path:string)=>{
      const original=owner[key];if(typeof original==='string'&&original.trim()&&!used.has(original)){used.add(original);return;}
      const base='record-'+sha256(String(manifest.sourceSha256)+':'+path).slice(0,16);let next=base,suffix=1;while(used.has(next))next=base+'-'+(++suffix);
      owner[key]=next;used.add(next);this.retainField(result,path,original,'法术技术标识已由程序重分配；法术与使用次数保留。');
    };
    const evidence=(owner:any,path:string)=>{
      const supplied=owner.evidence,entries=Array.isArray(supplied)?supplied:[];
      owner.evidence=entries.flatMap((entry:any,index:number)=>{
        if(entry&&typeof entry==='object'&&!Array.isArray(entry)&&Number.isSafeInteger(entry.start)&&Number.isSafeInteger(entry.end)&&entry.start>=0&&entry.end>entry.start&&typeof entry.quote==='string'&&entry.quote.length===entry.end-entry.start){
          if(Object.keys(entry).some(key=>!['start','end','quote'].includes(key)))this.retainField(result,path+'/'+index,entry,'证据附带字段保留在审阅记录中；法术不受影响。');
          return[{start:entry.start,end:entry.end,quote:entry.quote}];
        }
        this.retainField(result,path+'/'+index,entry,'此来源引文记录未映射；法术及限制原文保留。');return[];
      });
      if(!entries.length)this.retainField(result,path,supplied??[],'来源引文记录未提供；法术及限制原文保留供核对。');
    };
    const changes=new Map<string,Array<{groupId:string;refId:string}>>();
    groups.forEach((group:any,groupIndex:number)=>{
      if(!group||typeof group!=='object'||Array.isArray(group))return;
      const oldGroup=group.groupId;id(group,'groupId',`/spellcastingGroups/${groupIndex}/groupId`);
      for(const [refIndex,ref]of (Array.isArray(group.spellRefs)?group.spellRefs:[]).entries()){
        if(!ref||typeof ref!=='object'||Array.isArray(ref))continue;
        const path=`/spellcastingGroups/${groupIndex}/spellRefs/${refIndex}`,oldRef=ref.refId;
        id(ref,'refId',path+'/refId');evidence(ref,path+'/evidence');
        for(const [index,restriction]of (Array.isArray(ref.restrictions)?ref.restrictions:[]).entries())if(restriction&&typeof restriction==='object'&&!Array.isArray(restriction))evidence(restriction,path+'/restrictions/'+index+'/evidence');
        if(typeof oldGroup==='string'&&typeof oldRef==='string'){const key=JSON.stringify([oldGroup,oldRef]),mapped=changes.get(key)??[];mapped.push({groupId:group.groupId,refId:ref.refId});changes.set(key,mapped);}
      }
    });
    for(const group of groups)for(const ref of Array.isArray(group?.spellRefs)?group.spellRefs:[]){const reuse=ref?.reuseOf;if(!reuse)continue;const mapped=changes.get(JSON.stringify([reuse.groupId,reuse.refId]));if(mapped?.length===1)ref.reuseOf=mapped[0];}
  }

  private splitContent(content: string): { frontmatter: string; body: string } {
    const normalized = content.trim();

    // Case 1: Standard Jekyll-style frontmatter
    const match = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*([\s\S]*)$/);
    if (match) {
      // The separator consumes a YAML line break. Restore it so a final
      // keep-chomp (|+) scalar retains its exact source/evidence bytes.
      return { frontmatter: match[1]!+'\n', body: match[2]!.trim() };
    }

    // Case 2: No leading ---, but has a separator
    const sepMatch = normalized.match(/^([\s\S]*?)\n---\s*([\s\S]*)$/);
    if (sepMatch) {
      return { frontmatter: sepMatch[1]!, body: sepMatch[2]!.trim() };
    }

    return { frontmatter: normalized, body: '' };
  }

  private traverse(obj: any, result: ParsedNPC, isRoot = false) {
    if(!obj||typeof obj!=='object')return;
    for (const [key, value] of Object.entries(obj)) {
      if (isRoot && key === FORGE_SOURCE_ID_FIELD) continue;
      if (isRoot && key === 'intake-biography-mode') continue;
      if (isRoot && key === 'intake-biography-presentation') continue;
      if (isRoot && key === 'intake-legendary-ledger') continue;
      if (isRoot && key === 'intake-candidate-review') continue;
      const mapping = FIELD_MAPPING[key];

      if (mapping) {
        try{this.applyField(mapping, value, result);}catch(error){this.retainField(result,key,value,error);}
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Nested container (e.g. "能力" or "Attributes")
        this.traverse(value, result, false);
      } else {
        this.retainField(result,key,value,'此字段尚未映射，原始内容保留。');
      }
    }
  }

  private applyField(mapping: FieldDefinition, value: any, result: ParsedNPC) {
    const internalKey = mapping.key;
    const path = mapping.path; // e.g. "system.abilities.str.value"

    // Map Value if needed (e.g. for Saves array)
    const processedValue = this.processValue(mapping, value);

    // Determine target location in ParsedNPC
    if (path === 'resourceSemantics') {
      result.resourceSemantics = parseActorResourceSemantics(processedValue,(path,value,error)=>this.retainField(result,path,value,error));
    } else if (path === 'behaviorSemantics') {
      result.behaviorSemantics = parseActorBehaviorSemantics(processedValue);
    } else if (path === 'spellManifest') {
      const supplied=structuredClone(processedValue);
      this.normalizeSpellManifestRecords(supplied,result);
      for(const group of Array.isArray(supplied?.spellcastingGroups)?supplied.spellcastingGroups:[])
        for(const ref of Array.isArray(group?.spellRefs)?group.spellRefs:[]){
          for(const key of ['aliases','restrictions','evidence'])if(ref&&ref[key]!==undefined&&!Array.isArray(ref[key])){
            this.retainField(result,'法术清单/'+String(group.groupId)+'/'+String(ref.refId)+'/'+key,ref[key],'法术附带记录未映射；法术保留。');ref[key]=[];
          }
          if(Array.isArray(ref?.aliases))ref.aliases=ref.aliases.filter((alias:unknown,index:number)=>{
            if(typeof alias==='string'&&alias.trim())return true;
            this.retainField(result,'法术清单/'+String(group.groupId)+'/'+String(ref.refId)+'/aliases/'+index,alias,'法术别名未映射；该法术与同组其他法术保留。');return false;
          });
        }
      let validation = validateActorSpellManifestStructure(supplied);
      while(!validation.ok){
        const groups=Array.isArray(supplied?.spellcastingGroups)?supplied.spellcastingGroups:[];
        const invalidRefs=new Map<number,Set<number>>();
        let changed=false;
        for(const finding of validation.findings){
          const match=/^\/spellcastingGroups\/(\d+)\/spellRefs\/(\d+)(?:\/|$)/u.exec(finding.path);if(!match)continue;
          const groupIndex=Number(match[1]),refIndex=Number(match[2]),group=groups[groupIndex],ref=group?.spellRefs?.[refIndex];
          if(finding.code==='INVALID_SPELL_REUSE'&&ref?.reuseOf!==undefined){
            this.retainField(result,'法术清单/'+group.groupId+'/'+ref.refId+'/reuseOf',ref.reuseOf,finding.message+' 原生法术保留，未完成的复用关联由GM按原文处理。');delete ref.reuseOf;changed=true;continue;
          }
          if(finding.code==='INVALID_SHARED_USE'&&ref?.uses?.shared===true&&group.spellRefs.filter((entry:any)=>entry?.uses?.shared===true).length===1){
            this.retainField(result,'法术清单/'+group.groupId+'/'+ref.refId+'/uses',structuredClone(ref.uses),'共享成员尚未全部映射；保留现有同一计数与恢复，其他成员规则仍可查看。');ref.uses.shared=false;changed=true;continue;
          }
          const refs=invalidRefs.get(groupIndex)??new Set<number>();refs.add(refIndex);invalidRefs.set(groupIndex,refs);
        }
        for(const[groupIndex,refs]of invalidRefs){
          const group=groups[groupIndex];if(!Array.isArray(group?.spellRefs))continue;
          group.spellRefs=group.spellRefs.filter((ref:any,index:number)=>{
            if(!refs.has(index))return true;
            const findings=validation.ok?[]:validation.findings.filter(finding=>finding.path===`/spellcastingGroups/${groupIndex}/spellRefs/${index}`||finding.path.startsWith(`/spellcastingGroups/${groupIndex}/spellRefs/${index}/`));
            this.retainField(result,'法术清单/'+group.groupId+'/spellRefs/'+index,ref,findings.map(finding=>finding.code+' '+finding.path).join('; ')+' 此引用未映射；同组其他法术保留。');changed=true;return false;
          });
        }
        if(!changed){
          const invalidGroups=new Set(validation.findings.flatMap(finding=>{const match=/^\/spellcastingGroups\/(\d+)(?:\/|$)/u.exec(finding.path);return match?[Number(match[1])]:[];}));
          if(!invalidGroups.size){this.retainField(result,'法术清单',supplied,validation.findings.map(finding=>finding.code+' '+finding.path).join('; '));return;}
          supplied.spellcastingGroups=groups.filter((group:any,index:number)=>{
            if(!invalidGroups.has(index))return true;
            this.retainField(result,'法术清单/'+index,group,'此组关联尚未映射；原始组规则与其他组法术保留。');return false;
          });
          if(!supplied.spellcastingGroups.length)return;
        }
        validation=validateActorSpellManifestStructure(supplied);
      }
      result.spellManifest=validation.value;
    } else if (path === 'name') {
      result.name = processedValue;
    } else if (path === 'type') {
      // ignore, fixed to npc
    } else if (path === 'img') {
      const image = String(processedValue ?? '').trim();
      if (image) {
        result.img = image;
      }
    } else if (path === 'prototypeToken.texture.src') {
      const image = String(processedValue ?? '').trim();
      if (image) result.tokenImg = image;
    } else if (path.startsWith('system.abilities')) {
      if (internalKey === 'saves') {
        this.parseSavingThrows(processedValue, result);
      } else {
        // system.abilities.str.value -> abilities.str
        // internalKey is "str"
        result.abilities[internalKey as keyof ParsedNPC['abilities']] = processedValue;
      }
    } else if (path.startsWith('system.attributes')) {
      if (internalKey === 'movement') {
        result.attributes.movement = this.parseMovement(processedValue);
      } else if (internalKey === 'hp') {
        // Handle HP format "256 (19d12+133)"
        result.attributes.hp = this.parseHP(processedValue);
      } else if (internalKey === 'ac') {
        // Handle AC format "19 (natural armor)"
        result.attributes.ac = this.parseAC(processedValue);
      } else if (internalKey === 'init') {
        result.attributes.init = parseInt(processedValue);
      } else if (internalKey === 'prof') {
        result.attributes.prof = parseInt(processedValue);
      } else if (internalKey === 'spellcasting') {
        const ability = this.normalizeAbility(processedValue);
        if (!ability) throw new Error(`InvalidSpellcastingAbility: ${String(processedValue)}`);
        result.attributes.spellcasting = ability;
      } else if (internalKey === 'legact') {
        const count = parseInt(processedValue);
        if (!Number.isInteger(count) || count < 1) throw new Error('InvalidLegendaryActionCount: expected a positive integer.');
        result.attributes.legact = { value: count, max: count };
      } else if (internalKey === 'legres') {
        // Schema-derived explicit counter: never read a capacity from a trait
        // title, recovery sentence, expression or another numeric field.
        const literal=typeof value==='string'?value.trim():value;
        const count=typeof literal==='number'?literal:typeof literal==='string'&&/^[1-9]\d*$/u.test(literal)?Number(literal):Number.NaN;
        if(!Number.isSafeInteger(count)||count<1)throw Error('InvalidLegendaryResistanceCount: expected a literal positive integer.');
        if(result.attributes.legres&&result.attributes.legres.max!==count)throw Error('InvalidLegendaryResistanceConflict: explicit counts disagree.');
        result.attributes.legres={value:count,max:count};
      }
    } else if (path.startsWith('system.details')) {
      if (internalKey === 'cr') result.details.cr = this.parseChallengeRating(processedValue);
      if (internalKey === 'xp') result.details.xp = parseInt(processedValue);
      if (internalKey === 'alignment') result.details.alignment = processedValue;
      if (internalKey === 'swarmSize') {
        const sizes:Record<string,CreatureSize>={'微型':'tiny','小型':'small','中型':'medium','大型':'large','巨型':'huge','超巨型':'gargantuan',tiny:'tiny',small:'small',medium:'medium',large:'large',huge:'huge',gargantuan:'gargantuan'};
        const value=sizes[String(processedValue).trim().toLowerCase()];
        if(!value)throw new Error('InvalidSwarmSize: 集群个体体型 must be a supported creature size.');
        result.details.swarmSize=value;
      }
      if (internalKey === 'creatureType') result.details.creatureType = processedValue;
      if (internalKey === 'creatureTypeCustom') result.details.creatureTypeCustom = processedValue;
      if (internalKey === 'spellLevel') result.details.spellLevel = parseInt(processedValue);
      if (internalKey === 'biography') {
        const existingBiography = result.details.biography?.trim();
        const frontmatterBiography = String(processedValue ?? '').trim();
        if (frontmatterBiography) {
          result.details.biography = [frontmatterBiography, existingBiography]
            .filter((part): part is string => Boolean(part))
            .join('\n')
            .trim();
        }
      }
    } else if (path === 'system.spells') {
      if (!processedValue || typeof processedValue !== 'object' || Array.isArray(processedValue)) {
        throw new Error('InvalidSpellSlots: 法术位 must be an object keyed by spell level.');
      }
      const slots: ParsedNPC['spellSlots'] = {};
      for (const [levelText, countValue] of Object.entries(processedValue as Record<string, unknown>)) {
        const level = Number(levelText);
        const count = Number(countValue);
        if (!Number.isInteger(level) || level < 1 || level > 9 || !Number.isInteger(count) || count < 1) {
          this.retainField(result,'法术位/'+levelText,countValue,'此法术位记录按原始资料处理。');
          continue;
        }
        slots[level as keyof NonNullable<ParsedNPC['spellSlots']>] = count;
      }
      result.spellSlots = slots;
    } else if (path === 'items') {
      if (internalKey === 'actions' || internalKey === '动作') result.actions = processedValue;
      if (internalKey === 'reactions' || internalKey === '反应') result.reactions = processedValue;
      if (internalKey === 'bonus_actions' || internalKey === '附赠动作') result.bonus_actions = processedValue;
      if (internalKey === 'legendary_actions' || internalKey === '传奇动作') {
        result.legendary_actions = processedValue;
        if (Array.isArray(processedValue) && processedValue.length > 0) {
          const first = processedValue[0];
          if (typeof first === 'string') {
            const match = first.match(CHINESE_ACTION_REGEX.CHINESE_LEGENDARY_ACTION_COUNT) ||
                          first.match(CHINESE_ACTION_REGEX.LEGENDARY_ACTION_COUNT);
            if (match && match[1]) {
              const count = parseInt(match[1]);
              if (!result.attributes.legact) {
                result.attributes.legact = { value: count, max: count };
              }
            }
          }
        }
      }
      if (internalKey === 'mythic_actions' || internalKey === '神话动作') result.mythic_actions = processedValue;
      if (internalKey === 'lair_actions' || internalKey === '巢穴动作') {
        result.lair_actions = processedValue;
        result.lairInitiative = this.extractLairInitiative(processedValue);
      }
      if (internalKey === 'regional_effects' || internalKey === '巢穴效应') result.regional_effects = processedValue;
      if (internalKey === 'spellcasting' || internalKey === '施法') result.spellcasting = processedValue;
      if (
        ['特性', '动作', '附赠动作', '反应', '传奇动作', '神话动作'].includes(internalKey) &&
        this.isStructuredActionSection(processedValue)
      ) {
        const structuredParser = new StructuredActionParser();
        const sectionMap: Record<string, string> = {
          '特性': '特性',
          '动作': '动作',
          '附赠动作': '附赠动作',
          '反应': '反应',
          '传奇动作': '传奇动作',
          '神话动作': '神话动作',
        };
        const mapped = sectionMap[internalKey];
        if (mapped) {
          result.structuredActions = result.structuredActions ?? {};
          const sa = result.structuredActions as Record<string, StructuredActionData[]>;
          sa[mapped] = structuredParser.parseStructuredSection(processedValue, internalKey);
        }
      }
    } else if (path.startsWith('system.traits')) {
      if (internalKey === 'senses') {
        const parsedSenses = this.parseSenses(processedValue);
        result.traits.senses = parsedSenses.senses;
        if (parsedSenses.passivePerception !== undefined) {
          result.skillPassives = {
            ...(result.skillPassives || {}),
            prc: parsedSenses.passivePerception,
          };
        }
      } else if (internalKey === 'size') {
        const sizeMap: Record<string, string> = {
          '微型': 'tiny', '极小': 'tiny',
          '小型': 'sm',
          '中型': 'med',
          '大型': 'lg',
          '巨型': 'huge',
          '超巨型': 'grg'
        };
        result.traits.size = sizeMap[processedValue] || processedValue;
      } else if (internalKey === 'dm') {
        result.traits.dm = this.parseDamageMod(processedValue);
      } else if (internalKey === 'dvCustom') {
        if(typeof processedValue!=='string')throw Error('InvalidVulnerabilityCustom: expected literal text.');
        result.traits.dvCustom=processedValue;
      } else if (internalKey === 'languagesCustom') {
        result.traits.languagesCustom = String(processedValue ?? '').trim();
      } else {
        // dr, di, ci, languages -> array
        if (['dr', 'di', 'dv'].includes(internalKey) && Array.isArray(processedValue)) {
          const bypasses: string[] = [];
          const filtered = processedValue.filter((v: any) => {
            if (typeof v !== 'string') return true;
            const b = this.detectBypasses(v);
            if (b) {
              bypasses.push(b);
              return false;
            }
            return true;
          });
          result.traits[internalKey as 'dr' | 'di' | 'dv'] = filtered;
          if (bypasses.length > 0) {
            result.traits.bypasses = Array.from(new Set([...(result.traits.bypasses || []), ...bypasses]));
          }
        } else {
          result.traits[internalKey as keyof ParsedNPC['traits']] = processedValue;
        }
      }

    } else if (path.startsWith('system.skills')) {
      // skills: { 察觉: 专精 }
      // Map keys and values?
      // Keys: "察觉" -> "prc"
      // Values: "专精" -> 2
      this.parseSkills(processedValue, result);
    }
  }

  private parseChallengeRating(value: unknown): number {
    const normalized = String(value ?? '').trim();
    // Standard source Markdown commonly writes CR as "1/4 (50 XP)".
    // Read the fraction before the optional XP note so it is not silently
    // coerced to 1 by parseFloat.
    const fraction = normalized.match(/^(\d+)\s*\/\s*(\d+)(?:\s*\(|\s*$)/);
    if (fraction?.[1] && fraction[2]) {
      const numerator = Number.parseInt(fraction[1], 10);
      const denominator = Number.parseInt(fraction[2], 10);
      if (denominator > 0) return numerator / denominator;
    }

    return Number.parseFloat(normalized);
  }

  private isStructuredActionSection(value: unknown): boolean {
    if (!Array.isArray(value)) {
      return false;
    }

    const structuredKeys = new Set([
      '名称',
      'name',
      '类型',
      'type',
      '描述',
      'describe',
      '激活',
      'activationType',
      'activation',
      '子活动',
      '内嵌效果',
      '攻击类型',
      'attackType',
      '命中',
      'toHit',
      '范围',
      'range',
      '伤害',
      'DC',
      'AoE',
      'aoe',
      '目标',
      'target',
      '充能',
      'recharge',
      '每日',
      'perLongRest',
      '专注',
      'concentration',
      '失败效果',
      '成功效果',
      '特殊效果',
      'specialEffects',
      'spellcastingFeatureKey',
      'weapon-properties',
      'weaponProperties',
      '武器特性',
      'native-mastery',
      'nativeMastery',
      '原生精通',
    ]);

    return value.some((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return false;
      }

      return Object.keys(entry as Record<string, unknown>).some((key) => structuredKeys.has(key));
    });
  }

  private extractBodySections(body: string): YamlBodyExtractionResult {
    const sectionLines: Record<YamlBodySectionKey, string[]> = {
      traits: [],
      actions: [],
      bonus_actions: [],
      reactions: [],
      legendary_actions: [],
      mythic_actions: [],
      raw_notes: [],
    };
    const biographyLines: string[] = [];

    let currentSection: YamlBodySectionKey | undefined;
    let currentSectionLevel = 0;

    for (const rawLine of body.split(/\r?\n/)) {
      const heading = this.parseMarkdownHeading(rawLine);
      if (heading) {
        if (currentSection && heading.level > currentSectionLevel) {
          sectionLines[currentSection].push(rawLine);
          continue;
        }

        const detectedSection = this.classifyBodySectionHeading(heading.title);
        if (detectedSection) {
          currentSection = detectedSection;
          currentSectionLevel = heading.level;
        } else {
          currentSection = undefined;
          currentSectionLevel = 0;
          biographyLines.push(rawLine);
        }
        continue;
      }

      if (currentSection) {
        sectionLines[currentSection].push(rawLine);
      } else {
        biographyLines.push(rawLine);
      }
    }

    return {
      biography: biographyLines.join('\n').trim(),
      traits: this.normalizeBodySectionLines(sectionLines.traits),
      actions: this.normalizeBodySectionLines(sectionLines.actions),
      bonus_actions: this.normalizeBodySectionLines(sectionLines.bonus_actions),
      reactions: this.normalizeBodySectionLines(sectionLines.reactions),
      legendary_actions: this.normalizeBodySectionLines(sectionLines.legendary_actions),
      mythic_actions: this.normalizeBodySectionLines(sectionLines.mythic_actions),
    };
  }

  private parseMarkdownHeading(line: string): { level: number; title: string } | undefined {
    const match = line.match(/^\s{0,3}(#{1,6})\s*(.+?)\s*#*\s*$/);
    if (!match?.[1] || !match[2]) {
      return undefined;
    }

    return {
      level: match[1].length,
      title: match[2].trim(),
    };
  }

  private classifyBodySectionHeading(title: string): YamlBodySectionKey | undefined {
    const normalized = title.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    if (normalized.includes('神话动作') || normalized.includes('mythic actions')) {
      return 'mythic_actions';
    }

    if (normalized.includes('传奇动作') || normalized.includes('legendary actions')) {
      return 'legendary_actions';
    }

    if (normalized.includes('附赠动作') || normalized.includes('bonus actions')) {
      return 'bonus_actions';
    }

    if (normalized.includes('反应') || normalized.includes('reactions')) {
      return 'reactions';
    }

    if (normalized.includes('特性') || normalized.includes('traits')) {
      return 'traits';
    }

    if (normalized.includes('动作') || normalized === 'actions') {
      return 'actions';
    }

    if (normalized.includes('原始备注') || normalized.includes('raw notes')) {
      return 'raw_notes';
    }

    return undefined;
  }

  private normalizeBodySectionLines(lines: string[]): string[] {
    const merged: string[] = [];
    let currentLines: string[] = [];

    const flushCurrent = () => {
      if (currentLines.length === 0) {
        return;
      }

      merged.push(currentLines.join('\n').trim());
      currentLines = [];
    };

    for (const rawLine of lines) {
      const cleaned = this.cleanBodySectionLine(rawLine);
      if (!cleaned) {
        continue;
      }

      const indent = rawLine.match(/^\s*/)?.[0]?.length ?? 0;
      const trimmedRaw = rawLine.trimStart();
      const isTopLevelEntry =
        indent < 2 && (/^[-*+]\s+/.test(trimmedRaw) || /^\d+[.)]\s+/.test(trimmedRaw));

      if (isTopLevelEntry) {
        flushCurrent();
        currentLines.push(cleaned);
        continue;
      }

      if (currentLines.length === 0) {
        currentLines.push(cleaned);
        continue;
      }

      currentLines.push(cleaned);
    }

    flushCurrent();

    return merged;
  }

  private cleanBodySectionLine(line: string): string {
    let text = line.trim();
    if (!text) {
      return '';
    }

    while (text.startsWith('>')) {
      text = text.slice(1).trimStart();
    }

    text = text.replace(/^[-*+]\s*/, '');
    text = text.replace(/^\d+[.)]\s*/, '');

    const nestedHeading = this.parseMarkdownHeading(text);
    if (nestedHeading) {
      text = nestedHeading.title;
    }

    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/\*/g, '');

    return text.trim();
  }

  private shouldMergeBodySectionLine(
    previous: string | undefined,
    current: string,
    rawLine: string,
  ): boolean {
    if (!previous) {
      return false;
    }

    if (!current.trim()) {
      return false;
    }

    if (/^\s{2,}/.test(rawLine)) {
      return true;
    }

    if (!/[。！？.!?)]$/.test(previous.trim())) {
      return true;
    }

    if (/^(命中|豁免失败|豁免成功|强击|若|并且|且|成功|失败|直到|目标|该目标|它|其|此后|额外|Bleed|Dazed|\(|\+|-|\d)/.test(current)) {
      return true;
    }

    return false;
  }

  private extractLairInitiative(lairActions: any): number | undefined {
    if (!Array.isArray(lairActions)) return undefined;
    const regex = /(?:on\s+)?initiative\s+(?:count\s+)?(\d+)/i;
    const cnRegex = /(?:在)?先攻(?:顺位|项)?\s*(\d+)/;

    for (const action of lairActions) {
      const text = typeof action === 'string' ? action : JSON.stringify(action);
      const match = text.match(regex) || text.match(cnRegex);
      if (match && match[1]) {
        return parseInt(match[1]);
      }
    }
    return undefined;
  }

  private processValue(mapping: FieldDefinition, value: any): any {
    if (mapping.type === 'array' && Array.isArray(value)) {
      return value.map(item => {
        if (typeof item === 'string') {
          const s = item.trim();
          if (!s) return item;

          if (mapping.key === 'ci' && s === '擒抱') return 'grappled';
          if (mapping.key === 'languages' && s === '深潜语') return 'deep';

          const itemMapping = FIELD_MAPPING[s];
          if (itemMapping) return itemMapping.key;

          const key = i18n.getKey(s);
          if (key) {
             let clean = key.replace(/^DND5E\./, '');
             // Use exact replacements for core types to avoid conpoisoned
             if (clean.includes('Condition')) {
                clean = clean.replace('Condition', '');
             } else if (clean.startsWith('Con') && !clean.includes('Constitution')) {
                clean = clean.replace(/^Con/, '');
             } else if (clean.includes('Damage')) {
                clean = clean.replace('Damage', '');
             } else if (clean.includes('Skill')) {
                clean = clean.replace('Skill', '');
             }
             return clean.toLowerCase();
          }
          return s;
        }
        return item;
      });
    }
    return value;
  }

  private parseMovement(value: string | object): Record<string, any> {
    if (typeof value === 'object') return value as Record<string, any>;
    const result: Record<string, any> = {};
    // "40尺, 攀爬40尺, 飞行80尺"
    const parts = value.split(/,|，/);

    for (const part of parts) {
      const p = part.trim();
      const match = p.match(/^([^\d]*?)(\d+)/);
      if (match && match[2]) {
        let typeRaw = (match[1] || '').trim();
        const dist = parseInt(match[2]);

        if (typeRaw === 'walk' || typeRaw === '步行' || typeRaw === '') {
            result['walk'] = dist;
        } else {
            const key = i18n.getKey(typeRaw);
            if (key) {
                let type = key.replace('DND5E.Movement', '').toLowerCase();
                if (type === 'fly') type = 'fly';
                result[type] = dist;
            } else {
                if (typeRaw.includes('攀爬')) result['climb'] = dist;
                else if (typeRaw.includes('飞行') || typeRaw.includes('fly')) result['fly'] = dist;
                else if (typeRaw.includes('游泳') || typeRaw.includes('swim')) result['swim'] = dist;
                else if (typeRaw.includes('挖掘') || typeRaw.includes('burrow')) result['burrow'] = dist;
                else if (typeRaw.includes('悬浮') || typeRaw.includes('hover')) {
                  result['fly'] = dist;
                  result['hover'] = true;
                }
            }
        }
        if (/(?:hover|\u60ac\u505c|\u60ac\u6d6e)/iu.test(p)) result['hover'] = true;
      }
    }
    return result;
  }

  private parseHP(value: string | number): { value: number; max: number; formula?: string } {
    if (typeof value === 'number') return { value, max: value };
    const trimmed = value.trim();
    const exact = trimmed.match(/^(\d+)$/);
    if (exact?.[1]) {
      const numeric = parseInt(exact[1], 10);
      return { value: numeric, max: numeric };
    }

    const withFormula = trimmed.match(/^(\d+)\s*\(([^)]+)\)$/);
    if (withFormula?.[1] && withFormula[2]) {
      const numeric = parseInt(withFormula[1], 10);
      return { value: numeric, max: numeric, formula: withFormula[2].trim() };
    }

    return { value: parseInt(trimmed), max: parseInt(trimmed) };
  }

  private parseAC(value: string | number): { value: number; calc: "flat" | "natural" | "default" } {
    if (typeof value === 'number') return { value, calc: "flat" };
    // "19 (天生护甲)"
    const val = parseInt(value);
    const isNatural = value.includes('天生') || value.includes('natural');
    return { value: val, calc: isNatural ? "natural" : "flat" };
  }

  private parseSenses(senses: any): { senses: Record<string, number | string>; passivePerception?: number } {
    const result: Record<string, number | string> = {};
    let passivePerception: number | undefined;
    if (typeof senses !== 'object' || senses === null) return { senses: result, passivePerception };

    const senseMap: Record<string, string> = {
      '黑暗视觉': 'darkvision',
      '盲视': 'blindsight',
      '震颤感知': 'tremorsense',
      '真实视觉': 'truesight',
      '被动察觉': 'passiveperception',
      '特殊': 'special',
    };

    for (const [k, v] of Object.entries(senses)) {
      const key = senseMap[k] || k;
      if (key === 'special') {
        const text = String(v).trim();
        if (text) {
          result.special = text;
        }
        continue;
      }
      const val = parseInt(String(v));
      if (key === 'passiveperception') {
        if (!isNaN(val)) {
          passivePerception = val;
        }
        continue;
      }
      if (!isNaN(val)) {
        result[key] = val;
      }
    }
    return { senses: result, passivePerception };
  }

  private parseDamageMod(value: any): { amount: Record<string, string>; bypasses: string[] } {
    const result = { amount: {} as Record<string, string>, bypasses: [] as string[] };
    if (typeof value !== 'object' || value === null) return result;

    for (const [k, v] of Object.entries(value)) {
      let key = k;
      // Try i18n lookup
      const i18nKey = i18n.getKey(k);
      if (i18nKey) {
        // e.g. "DND5E.DamageFire" -> "fire"
        key = i18nKey.replace(/^DND5E\.Damage/, '').toLowerCase();
      } else {
        // Fallback or if already English-like
        key = k.replace(/^DND5E\.Damage/, '').toLowerCase();
      }

      result.amount[key] = String(v);
    }
    return result;
  }

  private parseSkills(skills: Record<string, unknown>, result: ParsedNPC): void {
    const parsedSkills: Record<string, number> = {};
    const skillBonuses: Record<string, number> = {};
    const profBonus = this.getProficiencyBonus(result);

    for (const [key, val] of Object.entries(skills)) {
      // Map key: "察觉" -> "prc"
      const i18nKey = i18n.getKey(key);
      let skillKey = key;
      if (i18nKey) {
        // "DND5E.SkillPrc" -> "prc"
        skillKey = i18nKey.replace('DND5E.Skill', '').toLowerCase();
      }

      let skillValue = 0.5;
      const valStr = String(val);

      if (val !== null && typeof val === 'object') {
        // Source-derived additive contract: explicit totals cannot be confused
        // with the historical numeric proficiency levels below.
        const total = (val as Record<string, unknown>)['总加值'];
        if (Array.isArray(val) || Object.keys(val).length !== 1 || !Object.hasOwn(val, '总加值')
          || typeof total !== 'number' || !Number.isFinite(total) || !Number.isInteger(total)) {
          this.retainField(result,'技能/'+key,val,'此技能总值尚未转换；其他技能保留。');
          continue;
        }
        skillValue = this.inferSkillProficiency(skillKey, total, result, profBonus);
        // Source totals do not establish half proficiency. Avoid fractional
        // corrections at odd PB while leaving legacy half proficiency intact.
        if (skillValue === 0.5) skillValue = 0;
        const delta = total - this.expectedSkillModifier(skillKey, skillValue, result, profBonus);
        if (delta !== 0) skillBonuses[skillKey] = delta;
      } else if (valStr === '专精' || valStr === '2') {
        skillValue = 2;
      } else if (valStr === '熟练' || valStr === '1') {
        skillValue = 1;
      } else if (valStr === '半熟练' || valStr === '0.5') {
        skillValue = 0.5;
      } else {
        const num = parseFloat(valStr);
        if (!isNaN(num)) {
          if (num >= 0 && num <= 2) {
            skillValue = num;
          } else {
            skillValue = this.inferSkillProficiency(skillKey, num, result, profBonus);
            const expected = this.expectedSkillModifier(skillKey, skillValue, result, profBonus);
            const delta = num - expected;
            if (delta !== 0) {
              skillBonuses[skillKey] = delta;
            }
          }
        }
      }

      parsedSkills[skillKey] = skillValue;
    }

    result.skills = parsedSkills;
    result.skillBonuses = skillBonuses;
  }

  private parseSavingThrows(value: unknown, result: ParsedNPC): void {
    const saves = new Set<string>();
    const saveBonuses: Record<string, number> = {};
    const profBonus = this.getProficiencyBonus(result);

    const applyEntry = (rawKey: unknown, rawValue?: unknown) => {
      const ability = this.normalizeAbility(rawKey);
      if (!ability) return;

      if (rawValue === undefined) {
        saves.add(ability);
        return;
      }

      const numeric = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue));
      if (!Number.isNaN(numeric)) {
        const baseMod = this.abilityModifier(result.abilities[ability] ?? 10);
        const proficient = numeric >= baseMod + (profBonus ?? 0) - 0.25;
        if (proficient) {
          saves.add(ability);
        }
        const expected = baseMod + (proficient ? profBonus ?? 0 : 0);
        const delta = numeric - expected;
        if (delta !== 0) {
          saveBonuses[ability] = delta;
        }
        return;
      }

      saves.add(ability);
    };

    if (Array.isArray(value)) {
      for (const entry of value) {
        applyEntry(entry);
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, rawValue] of Object.entries(value)) {
        applyEntry(key, rawValue);
      }
    } else if (typeof value === 'string') {
      const entries = value.split(/[,;，]/).map((entry) => entry.trim()).filter(Boolean);
      for (const entry of entries) {
        const match = entry.match(/^(.+?)\s*([+-]?\d+)\s*$/);
        if (match?.[1] && match[2]) {
          applyEntry(match[1], Number.parseInt(match[2], 10));
        } else {
          applyEntry(entry);
        }
      }
    }

    result.saves = Array.from(saves);
    result.saveBonuses = saveBonuses;
  }

  private getProficiencyBonus(result: ParsedNPC): number | undefined {
    if (typeof result.attributes.prof === 'number' && Number.isFinite(result.attributes.prof)) {
      return result.attributes.prof;
    }

    if (typeof result.details.cr === 'number' && Number.isFinite(result.details.cr)) {
      if (result.details.cr >= 17) return 6;
      if (result.details.cr >= 13) return 5;
      if (result.details.cr >= 9) return 4;
      if (result.details.cr >= 5) return 3;
      return 2;
    }

    return undefined;
  }

  private inferSkillProficiency(
    skillKey: string,
    modifier: number,
    result: ParsedNPC,
    profBonus: number | undefined,
  ): number {
    const abilityKey = this.getSkillAbility(skillKey);
    if (!abilityKey || !profBonus) {
      return 1;
    }

    const baseMod = this.abilityModifier(result.abilities[abilityKey] ?? 10);
    const level = (modifier - baseMod) / profBonus;
    if (!Number.isFinite(level)) return 1;
    if (level >= 1.75) return 2;
    if (level >= 0.75) return 1;
    if (level >= 0.25) return 0.5;
    return 0;
  }

  private expectedSkillModifier(
    skillKey: string,
    proficiency: number,
    result: ParsedNPC,
    profBonus: number | undefined,
  ): number {
    const abilityKey = this.getSkillAbility(skillKey);
    const baseMod = this.abilityModifier(abilityKey ? result.abilities[abilityKey] ?? 10 : 10);
    if (!profBonus) {
      return baseMod;
    }
    return baseMod + proficiency * profBonus;
  }

  private getSkillAbility(skillKey: string): keyof ParsedNPC['abilities'] | undefined {
    const map: Record<string, keyof ParsedNPC['abilities']> = {
      acr: 'dex',
      ani: 'wis',
      arc: 'int',
      ath: 'str',
      dec: 'cha',
      his: 'int',
      ins: 'wis',
      itm: 'cha',
      inv: 'int',
      med: 'wis',
      nat: 'int',
      prc: 'wis',
      prf: 'cha',
      per: 'cha',
      rel: 'int',
      slt: 'dex',
      ste: 'dex',
      sur: 'wis',
    };

    return map[skillKey];
  }

  private abilityModifier(score: number): number {
    return Math.floor((score - 10) / 2);
  }

  private normalizeAbility(value: unknown): keyof ParsedNPC['abilities'] | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z\u4e00-\u9fff]+/g, ' ')
      .trim();

    const map: Record<string, keyof ParsedNPC['abilities']> = {
      str: 'str',
      strength: 'str',
      力量: 'str',
      dex: 'dex',
      dexterity: 'dex',
      敏捷: 'dex',
      con: 'con',
      constitution: 'con',
      体质: 'con',
      int: 'int',
      intelligence: 'int',
      智力: 'int',
      wis: 'wis',
      wisdom: 'wis',
      感知: 'wis',
      cha: 'cha',
      charisma: 'cha',
      魅力: 'cha',
    };

    if (map[normalized]) {
      return map[normalized];
    }

    const i18nKey = i18n.getKey(value);
    if (i18nKey?.startsWith('DND5E.Ability')) {
      return i18nKey.replace('DND5E.Ability', '').toLowerCase() as keyof ParsedNPC['abilities'];
    }

    return undefined;
  }

  private detectBypasses(text: string): string | null {
    const t = text.toLowerCase();
    if (t.includes('非魔法') || t.includes('nonmagical')) return 'mgc';
    if (t.includes('精金') || t.includes('adamantine')) return 'ada';
    if (t.includes('镀银') || t.includes('silvered')) return 'sil';
    return null;
  }
}
