type Document = Record<string, any>;
type Root = Record<string, any>;

export interface CurseChoice {
  itemId: string;
  activityId: string;
  targetUuids: string[];
}

export interface CurseSelection {
  action: 'bonus' | 'reaction';
  curses: CurseChoice[];
}

export interface LearnedCurseActivity { item: Document; activity: Document }
interface CurseGroup { identity: string; name: string; normal?: LearnedCurseActivity; amplified?: LearnedCurseActivity }
export interface CurseTarget { uuid: string; name: string; img: string; inCombat: boolean; targeted: boolean; token: Document }
const values = (collection: any): Document[] => Array.from(collection?.contents ?? collection?.values?.() ?? collection ?? []);
const escape = (text: string): string => text.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export function curseIdentity(item: Document): string {
  const metadata = item.flags?.fvttJsonGenerator?.bloodHunter2024;
  const identity = metadata?.sourceIdentity;
  if (typeof identity?.source === 'string' && identity.source.trim() && typeof identity.normalizedName === 'string' && identity.normalizedName.trim()) return `source:${identity.source.trim()}|${identity.normalizedName.trim()}`;
  return metadata?.canonicalId ? `canonical:${metadata.canonicalId}`
    : metadata?.sourceKey ? `source:${metadata.sourceKey}`
    : `identifier:${item.system.identifier}`;
}

export function curseTargetMode(activity: Document): 'token' | 'self' | 'area' | 'none' {
  if (activity.target?.template?.type) return 'area';
  if (activity.target?.affects?.type === 'self') return 'self';
  return ['ally', 'enemy', 'creature', 'creatureOrObject', 'willing'].includes(activity.target?.affects?.type) ? 'token' : 'none';
}

function allowsMultipleTargets(activity: Document): boolean {
  const affects = activity.target?.affects;
  return Number(affects?.count) > 1 || !affects?.count && affects?.choice === true;
}

export function curseMatchesAction(activity: Document, action: CurseSelection['action']): boolean {
  return activity.activation?.type === action;
}

export function validateCurseSelection(selection: CurseSelection, choices: LearnedCurseActivity[]): LearnedCurseActivity[] {
  if (!['bonus', 'reaction'].includes(selection?.action) || !Array.isArray(selection.curses) || selection.curses.length < 1 || selection.curses.length > 2) throw new Error('请选择一至两个不同的已学血咒，并选择附赠动作或反应。');
  const identities = new Set<string>();
  return selection.curses.map((choice, index) => {
    const found = choices.find((entry) => entry.item.id === choice?.itemId && entry.activity.id === choice?.activityId);
    if (!found) throw new Error('所选血咒不属于该角色已学会的血咒。');
    if (!curseMatchesAction(found.activity, selection.action)) throw new Error('所选血咒的原本动作类型不符合本次附赠动作或反应，请重新选择。');
    const identity = curseIdentity(found.item);
    if (identities.has(identity)) throw new Error('同一个血咒只能选择一次；普通与增幅版本不能重复分配。');
    identities.add(identity);
    if (!Array.isArray(choice.targetUuids) || choice.targetUuids.some((uuid) => typeof uuid !== 'string')) throw new Error('血咒目标格式无效，请重新选择。');
    if (curseTargetMode(found.activity) === 'token' && !choice.targetUuids.length) throw new Error(`第${index + 1}个血咒需要选择目标；本次尚未施放或消耗次数。`);
    const count = Number(found.activity.target?.affects?.count);
    if (curseTargetMode(found.activity) === 'token' && count > 0 && choice.targetUuids.length > count) throw new Error(`第${index + 1}个血咒最多选择 ${count} 个目标；请按该血咒的目标规则重新选择。`);
    return found;
  });
}

export function groupLearnedCurses(choices: LearnedCurseActivity[]): CurseGroup[] {
  const groups = new Map<string, CurseGroup>();
  for (const entry of choices) {
    const identity = curseIdentity(entry.item);
    const group: CurseGroup = groups.get(identity) ?? { identity, name: entry.item.name };
    const version = /增幅|amplif/i.test(entry.activity.name ?? '') ? 'amplified' : 'normal';
    group[version] ??= entry;
    groups.set(identity, group);
  }
  return [...groups.values()];
}

export function curseTargets(root: Root): CurseTarget[] {
  const combat = root.game.combat;
  const combatTokens = new Set(combat?.scene?.id === root.canvas?.scene?.id ? values(combat.combatants).map((entry) => entry.tokenId) : []);
  const modes = root.CONST.TOKEN_DISPLAY_MODES;
  const targets = values(root.canvas?.tokens?.placeables)
    .filter((token) => token.actor && token.isVisible && root.MidiQOL.isTargetable(token))
    .map((token) => {
      const maySeeName = root.game.user.isGM || token.isOwner || token.document.displayName === modes.ALWAYS || token.document.displayName === modes.HOVER;
      const name = maySeeName ? root.MidiQOL.getTokenPlayerName?.(token, true) ?? token.name : '未公开名称';
      return { uuid: token.document.uuid, name, img: token.document.texture?.src ?? 'icons/svg/mystery-man.svg', inCombat: combatTokens.has(token.document.id), targeted: root.game.user.targets.has(token), token };
    }).sort((left, right) => left.uuid.localeCompare(right.uuid));
  const totals = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const target of targets) totals.set(target.name, (totals.get(target.name) ?? 0) + 1);
  for (const target of targets) {
    const name = target.name;
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    if (totals.get(name)! > 1) target.name = `${name} · ${count}`;
  }
  return targets;
}

export async function chooseCurses(choices: LearnedCurseActivity[], root: Root): Promise<CurseSelection | undefined> {
  let action: CurseSelection['action'] = 'bonus';
  let groups = groupLearnedCurses(choices.filter((entry) => curseMatchesAction(entry.activity, action)));
  const combat = root.game.combat;
  const useCombat = combat?.scene?.id === root.canvas?.scene?.id && values(combat?.combatants).length > 0;
  const targets = curseTargets(root).filter((target) => !useCombat || target.inCombat);
  const selected: CurseChoice[] = [];
  const versions = new Map(groups.map((group) => [group.identity, group.normal ? 'normal' : 'amplified']));
  let activeTarget = targets.find((target) => target.targeted)?.uuid ?? targets[0]?.uuid ?? '';
  let search = '';
  let hovered: Document | undefined;
  let priorHover = false;
  let form: HTMLFormElement;
  const entryFor = (group: CurseGroup): LearnedCurseActivity => (versions.get(group.identity) === 'amplified' ? group.amplified : group.normal)!;
  const selectionFor = (group: CurseGroup): CurseChoice | undefined => selected.find((choice) => choices.some((entry) => entry.item.id === choice.itemId && entry.activity.id === choice.activityId && curseIdentity(entry.item) === group.identity));
  const targetName = (choice: CurseChoice): string => choice.targetUuids.map((uuid) => targets.find((target) => target.uuid === uuid)!.name).join('、') || ({ self: '自身', area: '按血咒原生范围选择', none: '无需指定 Token', token: '' }[curseTargetMode(choices.find((entry) => entry.item.id === choice.itemId && entry.activity.id === choice.activityId)!.activity)]);
  const clearHover = () => {
    if (hovered) { hovered.hover = priorHover; hovered.refresh(); hovered = undefined; }
  };
  const highlight = (uuid?: string) => {
    const token = targets.find((target) => target.uuid === uuid)?.token;
    if (token === hovered) return;
    clearHover();
    if (token?.isVisible && root.MidiQOL.isTargetable(token)) { hovered = token; priorHover = token.hover; token.hover = true; token.refresh(); }
  };
  const targetOptions = (current: string[]) => targets.map((target) => `<option value="${escape(target.uuid)}"${current.includes(target.uuid) ? ' selected' : ''}>${escape(target.name)}</option>`).join('');
  const repaint = () => {
    const focusKey = (form.ownerDocument.activeElement as HTMLElement | null)?.dataset.bhFocus;
    clearHover();
    const filtered = targets.filter((target) => target.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    form.querySelector('[data-bh-targets]')!.innerHTML = filtered.map((target) => `<li class="bh-target-row"><button type="button" class="bh-target" data-bh-command="target" data-token-uuid="${escape(target.uuid)}" data-bh-focus="target:${escape(target.uuid)}" aria-pressed="${target.uuid === activeTarget}"><img src="${escape(target.img)}" alt="" width="36" height="36"><span>${escape(target.name)}</span></button><button type="button" class="bh-locate" data-bh-command="locate" data-token-uuid="${escape(target.uuid)}" data-bh-focus="locate:${escape(target.uuid)}" aria-label="定位 ${escape(target.name)}" title="在地图上定位"><i class="fa-solid fa-crosshairs" inert></i></button></li>`).join('') || '<li class="bh-empty">没有可选目标；请检查当前战斗的可见目标或更换搜索词。</li>';
    form.querySelector('[data-bh-current-target]')!.textContent = targets.find((target) => target.uuid === activeTarget)?.name ?? '先从左侧选择目标';
    form.querySelector('[data-bh-curses]')!.innerHTML = groups.map((group, index) => {
      const entry = entryFor(group);
      const choice = selectionFor(group);
      const mode = curseTargetMode(entry.activity);
      const sameTarget = choice && (mode !== 'token' || choice.targetUuids.includes(activeTarget));
      const reason = choice ? `已选：${targetName(choice)}${sameTarget ? '；可切换版本' : '；请在下方更换目标'}` : selected.length >= 2 ? '已选满两个不同血咒；先移除一个' : mode === 'token' && !activeTarget ? '先从左侧选择目标' : mode === 'self' ? '作用于自身' : mode === 'area' ? '范围与目标由原生活动继续选择' : mode === 'none' ? '无需指定 Token' : '分配给当前目标';
      return `<li class="bh-curse-row" data-curse-identity="${escape(group.identity)}"><div class="bh-curse-details"><strong>${escape(group.name)}</strong><span class="bh-help" id="bh-curse-reason-${index}">${escape(reason)}</span></div><label class="bh-version"><span class="bh-sr-only">${escape(group.name)}版本</span><select data-bh-version="${index}" data-bh-focus="version:${index}" aria-describedby="bh-curse-reason-${index}"${choice && !sameTarget || !choice && selected.length >= 2 ? ' disabled' : ''}>${group.normal ? `<option value="normal"${versions.get(group.identity) === 'normal' ? ' selected' : ''}${!activeTarget && curseTargetMode(group.normal.activity) === 'token' ? ' disabled' : ''}>普通</option>` : ''}${group.amplified ? `<option value="amplified"${versions.get(group.identity) === 'amplified' ? ' selected' : ''}${!activeTarget && curseTargetMode(group.amplified.activity) === 'token' ? ' disabled' : ''}>增幅</option>` : ''}</select></label><button type="button" data-bh-command="add" data-bh-curse="${index}" data-bh-focus="add:${index}" aria-describedby="bh-curse-reason-${index}"${choice || selected.length >= 2 || mode === 'token' && !activeTarget ? ' disabled' : ''}>${choice ? '已选择' : '加入'}</button></li>`;
    }).join('') || `<li class="bh-empty">没有以${action === 'bonus' ? '附赠动作' : '反应'}施放的已学血咒。可切换本次使用的动作类型。</li>`;
    form.querySelector('[data-bh-summary]')!.innerHTML = selected.map((choice, index) => {
      const entry = choices.find((entry) => entry.item.id === choice.itemId && entry.activity.id === choice.activityId)!;
      const group = groups.find((group) => group.identity === curseIdentity(entry.item))!;
      const tokenTarget = curseTargetMode(entry.activity) === 'token';
      return `<li class="bh-summary-row"><span class="bh-summary-name"><strong>${escape(group.name)}</strong><span class="bh-help">${versions.get(group.identity) === 'amplified' ? '增幅' : '普通'} · <span data-bh-selected-target-count>${tokenTarget ? `${choice.targetUuids.length} 个目标` : escape(targetName(choice))}</span></span></span>${tokenTarget ? `<label class="bh-change-target"><span class="bh-sr-only">${escape(group.name)}目标${allowsMultipleTargets(entry.activity) ? '，按住 Ctrl 或 Shift 多选' : ''}</span><select data-bh-move="${index}" data-bh-focus="move:${index}"${allowsMultipleTargets(entry.activity) ? ' multiple size="2" title="按住 Ctrl 或 Shift 多选目标"' : ''}>${targetOptions(choice.targetUuids)}</select></label>` : ''}<button type="button" data-bh-command="remove" data-bh-selection="${index}" data-bh-focus="remove:${index}" aria-label="移除 ${escape(group.name)}">移除</button></li>`;
    }).join('') || '<li class="bh-empty">从左侧选目标，再加入一至两个不同的已学血咒。</li>';
    let selectionError = '';
    if (selected.length) {
      try { validateCurseSelection({ action, curses: selected }, choices); }
      catch (error) { selectionError = (error as Error).message; }
    }
    form.querySelector('[data-bh-cost]')!.textContent = `已选 ${selected.length}/2 · 资源按各血咒配置 · 共用一次${action === 'reaction' ? '反应' : '附赠动作'}${selectionError ? `。${selectionError}` : ''}`;
    form.querySelector<HTMLButtonElement>('[data-action="cast"]')!.disabled = !selected.length || !!selectionError;
    if (focusKey) {
      const controls = Array.from(form.querySelectorAll<HTMLElement>('[data-bh-focus]'));
      const sameControl = controls.find((element) => element.dataset.bhFocus === focusKey && !(element as HTMLButtonElement).disabled);
      const fallback = focusKey.startsWith('add:') ? controls.find((element) => element.dataset.bhFocus === focusKey.replace('add:', 'version:'))
        : focusKey.startsWith('remove:') ? form.querySelector<HTMLElement>('[data-bh-command="remove"], [data-bh-command="add"]:not(:disabled)') : undefined;
      (sameControl ?? fallback)?.focus();
    }
  };
  const result = await root.foundry.applications.api.DialogV2.wait({
    classes: ['bh-curse-specialist-dialog'],
    window: { title: '诅咒专家 Curse Specialist', resizable: true },
    position: { width: Math.min(860, root.innerWidth - 32), height: Math.min(640, root.innerHeight - 32) }, modal: false,
    content: `<div class="bh-curse-specialist"><header class="bh-toolbar"><label class="bh-action">本次使用 <select name="action"><option value="bonus">附赠动作</option><option value="reaction">反应</option></select></label><p class="bh-help">最多两个不同血咒；反应须符合触发条件。</p></header><div class="bh-allocation"><section class="bh-target-panel" aria-label="选择目标"><div class="bh-panel-heading"><h3>选择目标</h3><span class="bh-help" data-bh-target-source>${useCombat ? '当前战斗' : '当前场景 · 无适用战斗'}</span></div><label class="bh-target-search"><span class="bh-sr-only">搜索目标</span><input type="search" name="targetSearch" placeholder="搜索目标名称" aria-label="搜索目标"></label><ul class="bh-target-list" data-bh-targets></ul></section><section class="bh-curse-panel" aria-label="分配已学血咒"><div class="bh-panel-heading"><h3>分配血咒</h3><span class="bh-current-target" data-bh-current-target></span></div><ul class="bh-curse-list" data-bh-curses></ul></section></div><section class="bh-selection" aria-label="已选血咒"><div class="bh-selection-heading"><h3>本次施放</h3><p class="bh-cost" data-bh-cost role="status" aria-live="polite"></p></div><ul class="bh-summary-list" data-bh-summary></ul></section></div>`,
    render: (_event: unknown, dialog: Document) => {
      form = dialog.element.querySelector('form');
      form.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-bh-command]');
        if (!button || button.disabled) return;
        const command = button.dataset.bhCommand;
        if (command === 'locate') {
          const token = targets.find((target) => target.uuid === button.dataset.tokenUuid)!.token;
          if (token.isVisible && root.MidiQOL.isTargetable(token)) { void root.canvas.animatePan({ ...token.center }); void root.canvas.ping(token.center); }
          return;
        }
        if (command === 'target') activeTarget = button.dataset.tokenUuid!;
        if (command === 'remove') selected.splice(Number(button.dataset.bhSelection), 1);
        if (command === 'add') {
          const group = groups[Number(button.dataset.bhCurse)]!;
          const entry = entryFor(group);
          const choice = { itemId: entry.item.id, activityId: entry.activity.id, targetUuids: curseTargetMode(entry.activity) === 'token' ? [activeTarget] : [] };
          validateCurseSelection({ action, curses: [...selected, choice] }, choices);
          selected.push(choice);
        }
        repaint();
      });
      form.addEventListener('change', (event) => {
        const input = event.target as HTMLSelectElement;
        if (input.name === 'action') {
          action = input.value as CurseSelection['action'];
          selected.length = 0;
          groups = groupLearnedCurses(choices.filter((entry) => curseMatchesAction(entry.activity, action)));
          versions.clear();
          for (const group of groups) versions.set(group.identity, group.normal ? 'normal' : 'amplified');
        }
        if (input.dataset.bhVersion !== undefined) {
          const group = groups[Number(input.dataset.bhVersion)]!;
          const choice = selectionFor(group);
          versions.set(group.identity, input.value);
          if (choice) {
            const entry = entryFor(group);
            choice.itemId = entry.item.id; choice.activityId = entry.activity.id;
            choice.targetUuids = curseTargetMode(entry.activity) === 'token' ? choice.targetUuids.length ? choice.targetUuids : activeTarget ? [activeTarget] : [] : [];
            const targetCount = Number(entry.activity.target?.affects?.count);
            if (targetCount > 0) choice.targetUuids = choice.targetUuids.slice(0, targetCount);
          }
        }
        if (input.dataset.bhMove !== undefined) selected[Number(input.dataset.bhMove)]!.targetUuids = Array.from(input.selectedOptions, (option) => option.value);
        repaint();
      });
      form.querySelector<HTMLInputElement>('[name="targetSearch"]')!.addEventListener('input', (event) => { search = (event.target as HTMLInputElement).value; repaint(); });
      form.addEventListener('mouseover', (event) => highlight((event.target as HTMLElement).closest<HTMLElement>('[data-token-uuid]')?.dataset.tokenUuid));
      form.addEventListener('mouseleave', clearHover);
      form.addEventListener('focusin', (event) => highlight((event.target as HTMLElement).closest<HTMLElement>('[data-token-uuid]')?.dataset.tokenUuid));
      form.addEventListener('focusout', clearHover);
      repaint();
    },
    buttons: [{ action: 'cast', label: '依次施放', disabled: true, default: true, callback: () => {
      const selection = { action: (form.elements.namedItem('action') as HTMLSelectElement).value, curses: selected } as CurseSelection;
      validateCurseSelection(selection, choices);
      return selection;
    } }, { action: 'cancel', label: '取消' }],
    close: clearHover, rejectClose: false,
  });
  clearHover();
  return result && typeof result === 'object' ? result : undefined;
}
