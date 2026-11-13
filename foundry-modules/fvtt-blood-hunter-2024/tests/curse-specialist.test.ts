import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { chooseCurses, curseMatchesAction, curseTargets, groupLearnedCurses, validateCurseSelection, type LearnedCurseActivity } from '../src/curse-specialist.ts';

const stylesheet = await Bun.file(new URL('../src/styles/migration.css', import.meta.url)).text();

function fixture() {
  const choices: LearnedCurseActivity[] = ['binding', 'marked', 'eyeless'].flatMap((name) => {
    const item = { id: name, name: `${name}血咒 Blood Curse of ${name}`, system: { identifier: `blood-curse-of-${name}` }, flags: { fvttJsonGenerator: { bloodHunter2024: { canonicalId: `canonical-${name}` } } } };
    return [false, true].map((amplified) => ({ item, activity: { id: `${name}-${amplified ? 'amplified' : 'normal'}`, name: amplified ? '增幅 Amplify' : '普通', activation: { type: 'bonus' }, target: { affects: { type: 'creature', count: 1 }, template: { type: '' } } } }));
  });
  const tokens = ['one', 'two', 'three'].map((id) => ({
    actor: { id: 'shared-actor' }, name: id === 'three' ? '不可见目标' : '骷髅', isVisible: id !== 'three', isOwner: false, hover: false, refreshes: 0,
    refresh() { this.refreshes++; }, center: { x: id === 'one' ? 100 : 200, y: 100 },
    document: { id, uuid: `Scene.test.Token.${id}`, displayName: 50, texture: { src: `tokens/${id}.webp` } },
  }));
  const pans: any[] = [], pings: any[] = [];
  const root: any = {
    innerWidth: 1280, innerHeight: 900,
    CONST: { TOKEN_DISPLAY_MODES: { ALWAYS: 50, HOVER: 30 } },
    game: { user: { isGM: true, targets: new Set([tokens[0]]) }, combat: { scene: { id: 'test' }, combatants: [{ tokenId: 'one' }, { tokenId: 'two' }] } },
    canvas: { scene: { id: 'test' }, tokens: { placeables: tokens }, animatePan: (point: any) => pans.push(point), ping: (point: any) => pings.push(point) },
    MidiQOL: { isTargetable: (token: any) => !token.untargetable, getTokenPlayerName: (token: any) => token.name },
  };
  return { root, choices, tokens, pans, pings };
}

function dialogHarness(root: any, run: (form: HTMLFormElement, config: any, window: any) => any) {
  root.foundry = { applications: { api: { DialogV2: { wait: async (config: any) => {
    const dom = new JSDOM(`<style>${stylesheet}</style><dialog class="application dialog ${config.classes.join(' ')}" style="width:${config.position.width}px;height:${config.position.height}px"><header class="window-header"></header><section class="window-content"><form class="dialog-form standard-form"><div class="dialog-content standard-form">${config.content}</div><footer class="form-footer">${config.buttons.map((button: any) => `<button type="button" data-action="${button.action}"${button.disabled ? ' disabled' : ''}>${button.label}</button>`).join('')}</footer></form></section></dialog>`, { url: 'https://foundry.test/' });
    const dialog = dom.window.document.querySelector('dialog')!;
    const form = dialog.querySelector('form')!;
    config.render({}, { element: dialog });
    try { return await run(form, config, dom.window); } finally { config.close(); dom.window.close(); }
  } } } } };
}

const click = (form: HTMLFormElement, selector: string) => form.querySelector<HTMLButtonElement>(selector)!.click();
function change(form: HTMLFormElement, selector: string, value: string, window: any) {
  const input = form.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}

describe('Curse Specialist target allocation dialog', () => {
  test('the actual fixed-grant and optional-pool Howl canonical sources occupy one global curse allocation', async () => {
    const { root, choices: otherChoices } = fixture();
    // Source identity and amplified Activity IDs from the two canonical Howl documents.
    const routes = [
      { canonicalId: '196c7d6877198b2a', activityId: '2b66a320974bf9bd', sourceKey: 'BloodHunter2024|subclassFeature|血猎手|化狼|15|blood-curse-of-the-howl', sourceIdentity: { source: 'BloodHunter2024', normalizedName: 'blood-curse-of-the-howl', group: 'subclassFeature', className: '血猎手', subclassShortName: '化狼', level: 15 } },
      { canonicalId: '75c59b1bfb11863c', activityId: '79d259f0fddb4de2', sourceKey: 'BloodHunter2024|optionalfeature|-|-|-|blood-curse-of-the-howl', sourceIdentity: { source: 'BloodHunter2024', normalizedName: 'blood-curse-of-the-howl', group: 'optionalfeature' } },
    ];
    const howlChoices: LearnedCurseActivity[] = routes.map((route) => ({
      item: { id: `owned-${route.canonicalId}`, name: '怒号血咒 Blood Curse of the Howl', system: { identifier: 'blood-curse-of-the-howl' }, flags: { fvttJsonGenerator: { bloodHunter2024: { canonicalId: route.canonicalId, sourceKey: route.sourceKey, sourceIdentity: route.sourceIdentity } } } },
      activity: { id: route.activityId, name: '增幅：怒号血咒 Amplify Blood Curse of the Howl', activation: { type: 'bonus', value: 1 }, target: { affects: { type: 'creature', count: '', choice: true }, template: { type: '' } } },
    }));
    const choices = [...howlChoices, ...otherChoices.slice(0, 2)];
    expect(() => validateCurseSelection({ action: 'bonus', curses: howlChoices.map((entry, index) => ({ itemId: entry.item.id, activityId: entry.activity.id, targetUuids: [`Scene.test.Token.${index ? 'two' : 'one'}`] })) }, choices)).toThrow('同一个血咒');
    dialogHarness(root, (form, config) => {
      expect(form.querySelectorAll('.bh-curse-row')).toHaveLength(2);
      click(form, '[data-bh-command="add"][data-bh-curse="0"]');
      click(form, '[data-bh-command="target"][data-token-uuid="Scene.test.Token.two"]');
      expect(form.querySelector<HTMLButtonElement>('[data-bh-command="add"][data-bh-curse="0"]')!.disabled).toBe(true);
      expect(form.querySelectorAll('.bh-summary-row')).toHaveLength(1);
      click(form, '[data-bh-command="add"][data-bh-curse="1"]');
      return config.buttons[0].callback();
    });
    expect((await chooseCurses(choices, root))!.curses.map((choice) => choice.itemId)).toEqual(['owned-196c7d6877198b2a', 'binding']);
  });

  test('filters exact source Activity activation, removes incompatible selections on action changes, and validates the same rule at submission', async () => {
    const { choices, root } = fixture();
    choices[1]!.activity.activation.type = 'reaction';
    for (const entry of choices.slice(2, 4)) entry.activity.activation.type = 'reaction';
    for (const entry of choices.slice(4)) entry.activity.activation.type = 'action';
    expect(curseMatchesAction(choices[0]!.activity, 'bonus')).toBe(true);
    expect(curseMatchesAction(choices[0]!.activity, 'reaction')).toBe(false);
    expect(curseMatchesAction({ activation: { type: 'reactiondamage' } }, 'reaction')).toBe(false);
    expect(curseMatchesAction({}, 'bonus')).toBe(false);
    expect(() => validateCurseSelection({ action: 'reaction', curses: [{ itemId: 'binding', activityId: 'binding-normal', targetUuids: ['Token.one'] }] }, choices)).toThrow('原本动作类型');
    dialogHarness(root, (form, config, window) => {
      expect(form.querySelectorAll('.bh-curse-row')).toHaveLength(1);
      expect(form.querySelectorAll('[data-bh-version="0"] option')).toHaveLength(1);
      expect(form.querySelector<HTMLSelectElement>('[data-bh-version="0"]')!.value).toBe('normal');
      click(form, '[data-bh-command="add"][data-bh-curse="0"]');
      expect(form.querySelectorAll('.bh-summary-row')).toHaveLength(1);
      change(form, '[name="action"]', 'reaction', window);
      expect(form.querySelectorAll('.bh-summary-row')).toHaveLength(0);
      expect(form.querySelector<HTMLButtonElement>('[data-action="cast"]')!.disabled).toBe(true);
      expect(form.querySelectorAll('.bh-curse-row')).toHaveLength(2);
      expect(form.querySelectorAll('[data-bh-version="0"] option')).toHaveLength(1);
      expect(form.querySelector<HTMLSelectElement>('[data-bh-version="0"]')!.value).toBe('amplified');
      click(form, '[data-bh-command="add"][data-bh-curse="0"]');
      expect(form.querySelector('[data-bh-cost]')!.textContent).toContain('共用一次反应');
      return config.buttons[0].callback();
    });
    expect(await chooseCurses(choices, root)).toEqual({ action: 'reaction', curses: [{ itemId: 'binding', activityId: 'binding-amplified', targetUuids: ['Scene.test.Token.one'] }] });
  });

  test('shows a recoverable empty state for an action with no compatible learned Activity', async () => {
    const { choices, root } = fixture();
    dialogHarness(root, (form, _config, window) => {
      change(form, '[name="action"]', 'reaction', window);
      expect(form.querySelectorAll('.bh-curse-row')).toHaveLength(0);
      expect(form.querySelector('[data-bh-curses]')!.textContent).toContain('没有以反应施放');
      expect(form.querySelector<HTMLButtonElement>('[data-action="cast"]')!.disabled).toBe(true);
      change(form, '[name="action"]', 'bonus', window);
      expect(form.querySelectorAll('.bh-curse-row')).toHaveLength(3);
      return 'cancel';
    });
    expect(await chooseCurses(choices, root)).toBeUndefined();
  });

  test('falls back to the current scene only when no applicable combat exists, keeping all visible targetable dispositions', async () => {
    const { choices, root, tokens } = fixture();
    Object.assign(tokens[0]!.document, { disposition: 1 });
    Object.assign(tokens[1]!.document, { disposition: 0 });
    for (const combat of [null, { scene: { id: 'another-scene' }, combatants: [{ tokenId: 'two' }] }, { scene: { id: 'test' }, combatants: [] }]) {
      root.game.combat = combat;
      dialogHarness(root, (form) => {
        expect(form.querySelectorAll('.bh-target')).toHaveLength(2);
        expect(form.querySelector('[data-bh-target-source]')!.textContent).toContain('当前场景');
        expect(form.querySelector('[name="targetScope"]')).toBeNull();
        return 'cancel';
      });
      expect(await chooseCurses(choices, root)).toBeUndefined();
    }
  });

  test('large target/curse lists and two multi-target summaries keep a fixed native footer inside numeric viewport-clamped dimensions', async () => {
    for (const viewportHeight of [420, 600, 900]) {
      const { choices, root, tokens } = fixture();
      root.innerHeight = viewportHeight;
      root.innerWidth = 1024;
      root.game.combat = null;
      root.canvas.tokens.placeables = Array.from({ length: 36 }, (_, index) => ({ ...tokens[0], name: `测试目标 ${index + 1}`, document: { ...tokens[0]!.document, id: `target${index}`, uuid: `Scene.test.Token.target${index}` } }));
      const manyCurses = Array.from({ length: 18 }, (_, index) => ({
        item: { ...choices[0]!.item, id: `curse${index}`, name: `已学血咒 ${index} Learned Blood Curse ${index}`, flags: { fvttJsonGenerator: { bloodHunter2024: { canonicalId: `curse${index}` } } } },
        activity: { ...choices[0]!.activity, id: `activity${index}`, target: { affects: { type: 'creature', count: '', choice: true }, template: { type: '' } } },
      }));
      dialogHarness(root, (form, config, window) => {
        const dialog = form.closest('dialog')!;
        expect(config.window.resizable).toBe(true);
        expect(config.position.width).toBeGreaterThan(0);
        expect(config.position.width).toBeLessThanOrEqual(root.innerWidth - 32);
        expect(typeof config.position.height).toBe('number');
        expect(config.position.height).toBeLessThanOrEqual(viewportHeight - 32);
        expect(form.querySelectorAll('.bh-target')).toHaveLength(36);
        expect(form.querySelectorAll('.bh-curse-row')).toHaveLength(18);
        for (const index of [0, 1]) {
          click(form, `[data-bh-command="add"][data-bh-curse="${index}"]`);
          const select = form.querySelector<HTMLSelectElement>(`[data-bh-move="${index}"]`)!;
          expect(select.multiple).toBe(true);
          expect(select.size).toBe(2);
          for (const option of Array.from(select.options).slice(0, 12)) option.selected = true;
          select.dispatchEvent(new window.Event('change', { bubbles: true }));
        }
        expect(form.querySelectorAll('.bh-summary-row')).toHaveLength(2);
        expect(Array.from(form.querySelectorAll('[data-bh-selected-target-count]'), (element) => element.textContent)).toEqual(['12 个目标', '12 个目标']);
        const footer = form.querySelector('.form-footer')!;
        expect(form.lastElementChild).toBe(footer);
        expect(footer.parentElement).toBe(form);
        expect(footer.closest('.dialog-content, .bh-allocation, .bh-summary-list')).toBeNull();
        expect(window.getComputedStyle(footer).flexShrink).toBe('0');
        for (const selector of ['.window-content', '.dialog-form', '.dialog-content', '.bh-curse-specialist', '.bh-allocation', '.bh-target-panel', '.bh-curse-panel']) {
          expect(window.getComputedStyle(dialog.querySelector(selector)).minHeight).toBe('0');
        }
        for (const selector of ['.bh-target-list', '.bh-curse-list', '.bh-summary-list']) {
          const style = window.getComputedStyle(form.querySelector(selector));
          expect(style.minHeight).toBe('0');
          expect(style.overflow).toBe('auto');
          expect(style.flexShrink).toBe('1');
        }
        expect(window.getComputedStyle(form.querySelector('.bh-selection')).maxHeight).toBe('36%');
        dialog.style.width = '700px'; dialog.style.height = '360px';
        expect(window.getComputedStyle(dialog).width).toBe('700px');
        expect(window.getComputedStyle(dialog).height).toBe('360px');
        expect(window.getComputedStyle(footer).flexShrink).toBe('0');
        expect(form.querySelector<HTMLButtonElement>('[data-action="cast"]')!.disabled).toBe(false);
        expect(config.buttons[0].callback().curses.map((choice: any) => choice.targetUuids.length)).toEqual([12, 12]);
        return 'cancel';
      });
      expect(await chooseCurses(manyCurses, root)).toBeUndefined();
    }
  });

  test('groups ordinary/amplified and duplicate embedded copies by canonical curse, not activity ID or display name', () => {
    const { choices } = fixture();
    const duplicate = { item: { ...choices[0]!.item, id: 'duplicate', name: '自己的译名' }, activity: { ...choices[1]!.activity, id: 'duplicate-amplified' } };
    expect(groupLearnedCurses([...choices, duplicate])).toHaveLength(3);
    expect(() => validateCurseSelection({ action: 'bonus', curses: [
      { itemId: 'binding', activityId: 'binding-normal', targetUuids: ['Token.one'] },
      { itemId: 'duplicate', activityId: 'duplicate-amplified', targetUuids: ['Token.two'] },
    ] }, [...choices, duplicate])).toThrow('同一个血咒');
    const renamed = { item: { ...choices[2]!.item, name: choices[0]!.item.name }, activity: choices[2]!.activity };
    expect(groupLearnedCurses([choices[0]!, renamed])).toHaveLength(2);
  });

  test('defaults to current combat without a scope picker; duplicate suffixes, search, focus and locate identify the actual Token', async () => {
    const { choices, root, tokens, pans, pings } = fixture();
    root.game.combat.combatants = [{ tokenId: 'two' }];
    dialogHarness(root, (form, config, window) => {
      expect(config.modal).toBe(false);
      expect(form.querySelector('[name="targetScope"]')).toBeNull();
      expect(form.querySelector('[data-bh-target-source]')!.textContent).toBe('当前战斗');
      expect(form.querySelectorAll('.bh-target')).toHaveLength(1);
      expect(form.querySelector('.bh-target')!.textContent).toBe('骷髅 · 2');
      expect(form.querySelector('.bh-target img')!.getAttribute('src')).toBe('tokens/two.webp');
      click(form, '[data-bh-command="target"]');
      expect(form.querySelector('[data-bh-current-target]')!.textContent).toBe('骷髅 · 2');
      form.querySelector<HTMLElement>('.bh-target')!.focus();
      expect(tokens[1]!.hover).toBe(true);
      click(form, '[data-bh-command="locate"]');
      expect(pans).toEqual([tokens[1]!.center]);
      expect(pings).toEqual([tokens[1]!.center]);
      const search = form.querySelector<HTMLInputElement>('[name="targetSearch"]')!;
      search.value = '没有匹配'; search.dispatchEvent(new window.Event('input', { bubbles: true }));
      expect(form.querySelectorAll('.bh-target')).toHaveLength(0);
      expect(form.querySelector('[data-bh-targets]')!.textContent).toContain('更换搜索词');
      expect(tokens[1]!.hover).toBe(false);
      return 'cancel';
    });
    expect(await chooseCurses(choices, root)).toBeUndefined();
    expect(tokens.every((token) => !token.hover)).toBe(true);
  });

  test('one row per curse switches ordinary/amplified and submits one actual activity to one token', async () => {
    const { choices, root } = fixture();
    dialogHarness(root, (form, config, window) => {
      expect(form.querySelectorAll('.bh-curse-row')).toHaveLength(3);
      expect(form.querySelector<HTMLButtonElement>('[data-action="cast"]')!.disabled).toBe(true);
      form.querySelector<HTMLElement>('[data-bh-command="add"][data-bh-curse="0"]')!.focus();
      click(form, '[data-bh-command="add"][data-bh-curse="0"]');
      expect(form.ownerDocument.activeElement).toBe(form.querySelector('[data-bh-version="0"]'));
      expect(form.querySelectorAll('.bh-summary-row')).toHaveLength(1);
      change(form, '[data-bh-version="0"]', 'amplified', window);
      expect(form.querySelectorAll('.bh-summary-row')).toHaveLength(1);
      expect(form.querySelector('[data-bh-summary]')!.textContent).toContain('增幅');
      expect(form.querySelector('[data-bh-cost]')!.textContent).toContain('已选 1/2 · 资源按各血咒配置');
      expect(form.querySelector<HTMLButtonElement>('[data-action="cast"]')!.disabled).toBe(false);
      return config.buttons[0].callback();
    });
    expect(await chooseCurses(choices, root)).toEqual({ action: 'bonus', curses: [{ itemId: 'binding', activityId: 'binding-amplified', targetUuids: ['Scene.test.Token.one'] }] });
  });

  test('two different curses share a target; full selection disables other rows and removing restores availability', async () => {
    const { choices, root } = fixture();
    for (const entry of choices) entry.activity.consumption = { targets: [] };
    dialogHarness(root, (form, config, window) => {
      click(form, '[data-bh-command="add"][data-bh-curse="0"]');
      click(form, '[data-bh-command="add"][data-bh-curse="1"]');
      expect(form.querySelectorAll('.bh-summary-row')).toHaveLength(2);
      expect(form.querySelector<HTMLButtonElement>('[data-bh-command="add"][data-bh-curse="2"]')!.disabled).toBe(true);
      expect(form.querySelector<HTMLSelectElement>('[data-bh-version="2"]')!.disabled).toBe(true);
      expect(form.querySelectorAll('.bh-curse-row')[2]!.textContent).toContain('先移除一个');
      click(form, '[data-bh-command="remove"][data-bh-selection="1"]');
      expect(form.querySelector<HTMLButtonElement>('[data-bh-command="add"][data-bh-curse="2"]')!.disabled).toBe(false);
      click(form, '[data-bh-command="add"][data-bh-curse="2"]');
      expect(form.querySelector('[data-bh-cost]')!.textContent).toBe('已选 2/2 · 资源按各血咒配置 · 共用一次附赠动作');
      expect(form.querySelector<HTMLButtonElement>('[data-action="cast"]')!.disabled).toBe(false);
      return config.buttons[0].callback();
    });
    const result = await chooseCurses(choices, root);
    expect(result!.curses.map((choice) => choice.itemId)).toEqual(['binding', 'eyeless']);
    expect(result!.curses.map((choice) => choice.targetUuids)).toEqual([['Scene.test.Token.one'], ['Scene.test.Token.one']]);
  });

  test('a curse allocated to another target stays globally reserved; summary target controls move without duplicating it', async () => {
    const { choices, root } = fixture();
    dialogHarness(root, (form, config, window) => {
      click(form, '[data-bh-command="add"][data-bh-curse="0"]');
      click(form, '[data-bh-command="target"][data-token-uuid="Scene.test.Token.two"]');
      expect(form.querySelector<HTMLButtonElement>('[data-bh-command="add"][data-bh-curse="0"]')!.disabled).toBe(true);
      expect(form.querySelector<HTMLSelectElement>('[data-bh-version="0"]')!.disabled).toBe(true);
      expect(form.querySelectorAll('.bh-curse-row')[0]!.textContent).toContain('骷髅 · 1');
      click(form, '[data-bh-command="add"][data-bh-curse="1"]');
      expect(config.buttons[0].callback().curses.map((choice: any) => choice.targetUuids)).toEqual([['Scene.test.Token.one'], ['Scene.test.Token.two']]);
      change(form, '[data-bh-move="0"]', 'Scene.test.Token.two', window);
      expect(form.querySelectorAll('.bh-summary-row')).toHaveLength(2);
      expect(form.querySelector<HTMLSelectElement>('[data-bh-version="0"]')!.disabled).toBe(false);
      return config.buttons[0].callback();
    });
    const result = await chooseCurses(choices, root);
    expect(result!.curses.map((choice) => choice.targetUuids)).toEqual([['Scene.test.Token.two'], ['Scene.test.Token.two']]);
  });

  test('one native multi-target curse keeps several token UUIDs in one selection and preserves them across amplification', async () => {
    const { choices, root } = fixture();
    for (const entry of choices.slice(0, 2)) entry.activity.target.affects = { type: 'creature', count: '', choice: true };
    dialogHarness(root, (form, config, window) => {
      click(form, '[data-bh-command="add"][data-bh-curse="0"]');
      const targets = form.querySelector<HTMLSelectElement>('[data-bh-move="0"]')!;
      expect(targets.multiple).toBe(true);
      for (const option of targets.options) option.selected = true;
      targets.dispatchEvent(new window.Event('change', { bubbles: true }));
      expect(form.querySelectorAll('.bh-summary-row')).toHaveLength(1);
      expect(form.querySelector('[data-bh-cost]')!.textContent).toContain('已选 1/2 · 资源按各血咒配置');
      change(form, '[data-bh-version="0"]', 'amplified', window);
      return config.buttons[0].callback();
    });
    expect((await chooseCurses(choices, root))!.curses).toEqual([{ itemId: 'binding', activityId: 'binding-amplified', targetUuids: ['Scene.test.Token.one', 'Scene.test.Token.two'] }]);
    expect(() => validateCurseSelection({ action: 'bonus', curses: [{ itemId: 'marked', activityId: 'marked-normal', targetUuids: ['Token.one', 'Token.two'] }] }, choices)).toThrow('最多选择 1 个目标');
  });

  test('switching amplified two-target back to ordinary keeps the first existing target and enables a valid visible selection', async () => {
    const { choices, root } = fixture();
    choices[1]!.activity.target.affects.count = 2;
    dialogHarness(root, (form, config, window) => {
      change(form, '[data-bh-version="0"]', 'amplified', window);
      click(form, '[data-bh-command="add"][data-bh-curse="0"]');
      const amplifiedTargets = form.querySelector<HTMLSelectElement>('[data-bh-move="0"]')!;
      expect(amplifiedTargets.multiple).toBe(true);
      for (const option of amplifiedTargets.options) option.selected = true;
      amplifiedTargets.dispatchEvent(new window.Event('change', { bubbles: true }));
      click(form, '[data-bh-command="target"][data-token-uuid="Scene.test.Token.two"]');
      change(form, '[data-bh-version="0"]', 'normal', window);
      const ordinaryTargets = form.querySelector<HTMLSelectElement>('[data-bh-move="0"]')!;
      expect(ordinaryTargets.multiple).toBe(false);
      expect(Array.from(ordinaryTargets.selectedOptions, (option) => option.value)).toEqual(['Scene.test.Token.one']);
      expect(form.querySelector<HTMLButtonElement>('[data-action="cast"]')!.disabled).toBe(false);
      expect(form.querySelector('[data-bh-cost]')!.textContent).not.toContain('最多选择');
      return config.buttons[0].callback();
    });
    expect((await chooseCurses(choices, root))!.curses).toEqual([{ itemId: 'binding', activityId: 'binding-normal', targetUuids: ['Scene.test.Token.one'] }]);
  });

  test('self and area preserve empty target UUIDs and remain usable without rendered targets', async () => {
    const { choices, root } = fixture();
    root.canvas.tokens.placeables = [];
    choices[0]!.activity.target.affects.type = 'self';
    choices[2]!.activity.target.template.type = 'circle';
    dialogHarness(root, (form, config) => {
      expect(form.querySelector<HTMLButtonElement>('[data-bh-command="add"][data-bh-curse="2"]')!.disabled).toBe(true);
      click(form, '[data-bh-command="add"][data-bh-curse="0"]');
      click(form, '[data-bh-command="add"][data-bh-curse="1"]');
      expect(form.querySelector('[data-bh-summary]')!.textContent).toContain('自身');
      expect(form.querySelector('[data-bh-summary]')!.textContent).toContain('原生范围');
      return config.buttons[0].callback();
    });
    expect((await chooseCurses(choices, root))!.curses.map((choice) => choice.targetUuids)).toEqual([[], []]);
  });

  test('players never receive hidden/private GM names, including DOM text, search or image labels', async () => {
    const { choices, root, tokens } = fixture();
    root.game.user.isGM = false;
    tokens[0]!.name = '秘密巫妖真名'; tokens[0]!.document.displayName = 0;
    tokens[1]!.name = '第二个秘密'; tokens[1]!.document.displayName = 0;
    expect(curseTargets(root).map((target) => target.name)).toEqual(['未公开名称 · 1', '未公开名称 · 2']);
    dialogHarness(root, (form) => {
      expect(form.innerHTML).not.toContain('秘密');
      expect(form.querySelector('.bh-target')!.textContent).toBe('未公开名称 · 1');
      return null;
    });
    expect(await chooseCurses(choices, root)).toBeUndefined();
    tokens[0]!.document.displayName = 50;
    root.MidiQOL.getTokenPlayerName = () => 'MIDI匿名显示名';
    expect(curseTargets(root)[0]!.name).toBe('MIDI匿名显示名');
  });

  test('cancel button, Escape/title close normalize to no selection and restore prior map hover', async () => {
    const { choices, root, tokens } = fixture();
    for (const result of ['cancel', null, undefined]) {
      tokens[0]!.hover = true;
      dialogHarness(root, (form) => { form.querySelector<HTMLElement>('.bh-target')!.focus(); return result; });
      expect(await chooseCurses(choices, root)).toBeUndefined();
      expect(tokens[0]!.hover).toBe(true);
      tokens[0]!.hover = false;
    }
  });
});
