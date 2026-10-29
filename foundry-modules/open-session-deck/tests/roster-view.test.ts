import { afterEach, describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { DeckRosterView } from '../src/roster-view.ts';
import { DeckOperationSelection, fittingSelectionTags, partySelectionKey } from '../src/operation-selection.ts';
import type { DeckActorCard, DeckSnapshot } from '../src/types.ts';

const originalGame = (globalThis as any).game;
afterEach(() => { (globalThis as any).game = originalGame; });
function card(uuid: string, combatantId?: string): DeckActorCard {
  const enabled = { enabled: true, tooltipKey: '' };
  return { uuid, name: uuid, img: '/portrait.webp', type: combatantId ? 'npc' : 'character', combatantId,
    statusChoices: [{ id: 'poisoned' }],
    commands: Object.fromEntries(['damage','heal','setTempHp','toggleInspiration','toggleStatus','exhaustionUp','exhaustionDown','toggleConcentration','toggleVisibility','toggleDefeated','setAcModifier','setMaxModifier','setHp','setDeathSave'].map((key) => [key, enabled])),
  } as unknown as DeckActorCard;
}
function snapshot(): DeckSnapshot {
  const hero = card('Actor.hero');
  return { supported: true, party: [hero], encounter: { active: true, uuid: 'Combat.one', round: 1, currentCombatantId: 'hero', combatants: [{ ...hero, combatantId: 'hero' }, card('Scene.one.Token.a.Actor.a','a'), card('Scene.one.Token.b.Actor.b','b')] } } as unknown as DeckSnapshot;
}
function fixture() {
  const dom = new JSDOM(`<main><section data-osd-deck>
    <input type="checkbox" data-osd-select-scope="party">
    <article data-osd-target-row><input type="checkbox" data-osd-select-target data-osd-scope="party" value="combatant:hero"><button data-osd-inspect>Hero</button><aside data-osd-inspection><span data-osd-inspection-selected></span></aside></article>
    <input type="checkbox" data-osd-select-scope="encounter">
    ${['hero','a','b'].map((key) => `<article data-osd-target-row><input type="checkbox" data-osd-select-target data-osd-scope="encounter" value="combatant:${key}"><button data-osd-inspect>${key}</button><aside data-osd-inspection><span data-osd-inspection-selected></span></aside></article>`).join('')}
    <section data-osd-operations hidden><strong data-osd-selection-count></strong><span data-osd-applicable-count="actor.toggle-inspiration"></span><span data-osd-applicable-count="combat.toggle-visibility"></span><div data-osd-selected-tags><div data-osd-tag-track></div><details data-osd-selection-overflow><summary></summary><div data-osd-selected-list></div></details><button data-osd-clear-selection>Clear</button></div><input type="number" data-osd-operation-input="amount" value="5"><button data-osd-operation="actor.damage" data-value-input="amount">Damage <small data-osd-eligible></small></button></section>
  </section></main>`);
  let width = 500;
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: this.matches('[data-osd-selected-tags]') ? width : this.matches('summary') ? 44 : this.matches('[data-osd-clear-selection]') ? 60 : 120, left:0,right:120,top:0,bottom:36,height:36,x:0,y:0,toJSON:()=>({}) };
  };
  const labels: Record<string,string> = { 'OSD.Selection.Count':'已选 {count} 个生物', 'OSD.Selection.Unchecked':'未勾选', 'OSD.Selection.Checked':'已勾选' };
  (globalThis as any).game = { i18n:{localize:(key:string)=>labels[key]??key} };
  return { root: dom.window.document.querySelector('main')!, dom, resize: (next: number) => { width = next; dom.window.dispatchEvent(new dom.window.Event('resize')); } };
}
function toggle(root: HTMLElement, selector: string) { root.querySelector<HTMLInputElement>(selector)!.click(); }

describe('unified operation selection', () => {
  test('steps only the draft number, respects its minimum, and retains it after rebinding', () => {
    const f=fixture(),view=new DeckRosterView();
    const amount=f.root.querySelector<HTMLInputElement>('[data-osd-operation-input="amount"]')!;
    amount.min='1';amount.insertAdjacentHTML('afterend','<button data-osd-step-input="amount" data-osd-step="1">Increase</button><button data-osd-step-input="amount" data-osd-step="-1">Decrease</button>');
    let batches=0;view.bind(f.root,snapshot(),async()=>{batches++;});
    f.root.querySelector<HTMLButtonElement>('[data-osd-step="1"]')!.click();expect(amount.value).toBe('6');
    amount.value='1';f.root.querySelector<HTMLButtonElement>('[data-osd-step="-1"]')!.click();expect(amount.value).toBe('1');
    f.root.querySelector<HTMLButtonElement>('[data-osd-step="1"]')!.click();view.bind(f.root,snapshot());
    expect(amount.value).toBe('2');expect(batches).toBe(0);
    view.dispose();f.dom.window.close();
  });
  test('resolves cached thumbnails for tags created by selection after the surface was bound', () => {
    const f=fixture(), view=new DeckRosterView(), base=snapshot();
    const hero={...base.party[0]!,portraitSource:'/hero.webp',img:'icons/svg/mystery-man.svg'};
    const value={...base,party:[hero],encounter:{...base.encounter,combatants:base.encounter.combatants.map((entry)=>entry.uuid===hero.uuid?{...hero,combatantId:entry.combatantId}:entry)}};
    view.bind(f.root,value,async()=>{},()=> 'blob:cached-hero');
    toggle(f.root,'[value="combatant:hero"]');
    const images=f.root.querySelectorAll<HTMLImageElement>('[data-osd-selected-tags] img,[data-osd-selected-list] img');
    expect(images).toHaveLength(2);
    for(const image of images) {
      expect(image.src).toBe('blob:cached-hero');
      expect(image.dataset.osdPortraitSource).toBe('/hero.webp');
    }
    view.dispose();f.dom.window.close();
  });
  test('shares the same PC across both lists but retains distinct linked encounter instances', () => {
    const value=snapshot(); expect(partySelectionKey(value.party[0]!,value)).toBe('combatant:hero');
    const model=new DeckOperationSelection(); model.update(value); model.toggle('combatant:hero',true);
    expect(model.selected).toHaveLength(1);
    const linked=card('Actor.shared','one');
    const linkedSnapshot={...value,encounter:{...value.encounter,combatants:[linked,{...linked,combatantId:'two'}]}};
    model.update(linkedSnapshot); model.toggle('combatant:one',true); model.toggle('combatant:two',true);
    expect(model.selected.map(entry=>entry.key)).toEqual(['combatant:one','combatant:two']);
  });

  test('clears on external current actor/round/combat changes or combat end, preserving ordinary refreshes', () => {
    for (const change of [
      (value:DeckSnapshot)=>({...value,encounter:{...value.encounter,currentCombatantId:'a'}}),
      (value:DeckSnapshot)=>({...value,encounter:{...value.encounter,round:2}}),
      (value:DeckSnapshot)=>({...value,encounter:{...value.encounter,uuid:'Combat.two'}}),
      (value:DeckSnapshot)=>({...value,encounter:{...value.encounter,active:false}}),
    ]) {
      const value=snapshot(), model=new DeckOperationSelection(); model.update(value); model.toggle('combatant:a',true);
      model.update({...value,refreshedAt:123}); expect(model.selected).toHaveLength(1);
      model.update(change(value)); expect(model.selected).toHaveLength(0);
    }
    const value=snapshot(), model=new DeckOperationSelection(); model.update(value); model.toggle('combatant:b',true);
    model.update({...value,encounter:{...value.encounter,combatants:value.encounter.combatants.filter(card=>card.combatantId!=='b')}});
    expect(model.selected).toHaveLength(0);
  });

  test('syncs mirrored checkboxes, keeps inspection separate and executes one planned batch', async () => {
    const f=fixture(), view=new DeckRosterView(), batches:any[]=[];
    view.bind(f.root,snapshot(),async(commands)=>{batches.push(commands);});
    toggle(f.root,'[data-osd-scope="party"][value="combatant:hero"]');
    expect(f.root.querySelector<HTMLInputElement>('[data-osd-scope="encounter"][value="combatant:hero"]')!.checked).toBeTrue();
    toggle(f.root,'[value="combatant:a"]');
    f.root.querySelector<HTMLButtonElement>('[value="combatant:b"]')!.closest('article')!.querySelector<HTMLButtonElement>('[data-osd-inspect]')!.click();
    expect(view.selection.selected).toHaveLength(2);
    expect(f.root.querySelector('[value="combatant:b"]')!.closest('article')!.querySelector('[data-osd-inspection-selected]')!.textContent).toBe('未勾选');
    const inspected=f.root.querySelector('[value="combatant:b"]')!.closest('article')!;
    toggle(f.root,'[value="combatant:b"]');expect(inspected.querySelector('[data-osd-inspection-selected]')!.textContent).toBe('已勾选');
    toggle(f.root,'[value="combatant:b"]');expect(inspected.querySelector('[data-osd-inspection-selected]')!.textContent).toBe('未勾选');
    expect(batches).toHaveLength(0);
    const amount=f.root.querySelector<HTMLInputElement>('[data-osd-operation-input]')!; amount.value='7'; amount.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
    f.root.querySelector<HTMLButtonElement>('[data-osd-operation]')!.click(); await Promise.resolve();
    expect(batches).toHaveLength(1); expect(batches[0]).toHaveLength(2);
    expect(batches[0].map((command:any)=>command.targetUuid)).toEqual(['Scene.one.Token.a.Actor.a','Actor.hero']);
    expect(batches[0].every((command:any)=>command.amount===7)).toBeTrue();
    view.dispose();f.dom.window.close();
  });

  test('keeps targets and typed numbers through replacement, clears turn targets and isolates surfaces', () => {
    const f=fixture(), view=new DeckRosterView(), value=snapshot();view.bind(f.root,value);
    toggle(f.root,'[value="combatant:a"]');
    const input=f.root.querySelector<HTMLInputElement>('[data-osd-operation-input]')!;input.value='19';input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
    const replacement=fixture();view.bind(replacement.root,{...value,refreshedAt:10});
    expect(replacement.root.querySelector<HTMLInputElement>('[value="combatant:a"]')!.checked).toBeTrue();
    expect(replacement.root.querySelector<HTMLInputElement>('[data-osd-operation-input]')!.value).toBe('19');
    const independent=fixture();const other=new DeckRosterView();other.bind(independent.root,value);expect(other.selection.selected).toHaveLength(0);
    view.update({...value,encounter:{...value.encounter,currentCombatantId:'a'}}); view.bind(replacement.root,{...value,encounter:{...value.encounter,currentCombatantId:'a'}});
    expect(replacement.root.querySelector<HTMLElement>('[data-osd-operations]')!.hidden).toBeTrue();
    view.dispose();other.dispose();f.dom.window.close();replacement.dom.window.close();independent.dom.window.close();
  });

  test('keeps an inspector above the active dock and inside the visible list, with a normal viewport when collapsed', () => {
    const f=fixture(),view=new DeckRosterView();
    const list=f.dom.window.document.createElement('div');list.className='osd-encounter-list';
    const row=f.root.querySelector('[value="combatant:b"]')!.closest('article')!;row.before(list);list.append(row);
    const button=row.querySelector<HTMLButtonElement>('[data-osd-inspect]')!,popup=row.querySelector<HTMLElement>('[data-osd-inspection]')!;
    list.getBoundingClientRect=()=>({left:650,right:1130,top:160,bottom:510,width:480,height:350} as DOMRect);
    button.getBoundingClientRect=()=>({left:710,right:900,top:440,bottom:474,width:190,height:34} as DOMRect);
    popup.getBoundingClientRect=()=>({width:300,height:190} as DOMRect);
    f.root.querySelector<HTMLElement>('[data-osd-operations]')!.getBoundingClientRect=()=>({top:527} as DOMRect);
    Object.defineProperties(f.dom.window,{innerWidth:{value:1158},innerHeight:{value:769}});
    view.bind(f.root,snapshot());toggle(f.root,'[value="combatant:a"]');button.click();
    expect(Number.parseFloat(popup.style.top)+190).toBeLessThanOrEqual(510);
    expect(Number.parseFloat(popup.style.left)).toBeGreaterThanOrEqual(650);
    expect(Number.parseFloat(popup.style.left)+300).toBeLessThanOrEqual(1130);
    expect(popup.style.maxHeight).toBe('350px');
    f.root.querySelector<HTMLButtonElement>('[data-osd-clear-selection]')!.click();button.click();
    expect(popup.style.top).toBe('440px');expect(popup.style.maxHeight).toBe('560px');
    view.dispose();f.dom.window.close();
  });

  test('expands above a short list to keep the inspector readable without covering the dock', () => {
    const f=fixture(),view=new DeckRosterView();
    const list=f.dom.window.document.createElement('div');list.className='osd-roster';
    const row=f.root.querySelector('[value="combatant:hero"]')!.closest('article')!;row.before(list);list.append(row);
    const button=row.querySelector<HTMLButtonElement>('[data-osd-inspect]')!,popup=row.querySelector<HTMLElement>('[data-osd-inspection]')!;
    list.getBoundingClientRect=()=>({left:52,right:762,top:180,bottom:357,width:710,height:177} as DOMRect);
    button.getBoundingClientRect=()=>({left:90,right:400,top:270,bottom:306,width:310,height:36} as DOMRect);
    popup.getBoundingClientRect=()=>({width:420,height:320} as DOMRect);
    f.root.querySelector<HTMLElement>('[data-osd-operations]')!.getBoundingClientRect=()=>({top:368} as DOMRect);
    Object.defineProperties(f.dom.window,{innerWidth:{value:784},innerHeight:{value:608}});
    view.bind(f.root,snapshot());toggle(f.root,'[value="combatant:hero"]');button.click();
    expect(popup.style.maxHeight).toBe('320px');
    expect(popup.style.top).toBe('37px');
    expect(Number.parseFloat(popup.style.top)+320).toBeLessThanOrEqual(360);
    expect(view.selection.selected).toHaveLength(1);
    view.dispose();f.dom.window.close();
  });

  test('measures chip widths, reserves +N space, exposes all selected targets and permits removal', () => {
    expect(fittingSelectionTags([100,120,90],350,6,44)).toBe(3);
    expect(fittingSelectionTags([100,120,90],250,6,44)).toBe(1);
    const f=fixture(), view=new DeckRosterView();view.bind(f.root,snapshot());
    toggle(f.root,'[data-osd-select-scope="encounter"]');
    expect(view.selection.selected).toHaveLength(3);expect(f.root.querySelector('[data-osd-selection-count]')!.textContent).toBe('已选 3 个生物');
    expect(f.root.querySelector('[data-osd-applicable-count="actor.toggle-inspiration"]')!.textContent).toBe('1');
    expect(f.root.querySelector('[data-osd-applicable-count="combat.toggle-visibility"]')!.textContent).toBe('3');
    f.resize(260);
    expect(f.root.querySelectorAll('[data-osd-tag-track] > [hidden]')).toHaveLength(2);
    expect(f.root.querySelector('[data-osd-selection-overflow] summary')!.textContent).toBe('+2');
    expect(f.root.querySelectorAll('[data-osd-selected-list] > button')).toHaveLength(3);
    f.root.querySelector<HTMLButtonElement>('[data-osd-selected-list] [data-osd-remove-selection="combatant:a"]')!.click();
    expect(view.selection.selected).toHaveLength(2);expect(f.root.querySelector<HTMLInputElement>('[value="combatant:a"]')!.checked).toBeFalse();
    f.resize(500);expect(f.root.querySelector<HTMLElement>('[data-osd-selection-overflow]')!.hidden).toBeTrue();
    view.setBusy(new Set(['Actor.hero']));expect(f.root.querySelector<HTMLButtonElement>('[data-osd-operation]')!.disabled).toBeTrue();
    view.setBusy(new Set());expect(f.root.querySelector<HTMLButtonElement>('[data-osd-operation]')!.disabled).toBeFalse();
    f.root.querySelector<HTMLButtonElement>('[data-osd-clear-selection]')!.click();expect(view.selection.selected).toHaveLength(0);
    view.dispose();f.dom.window.close();
  });
});
