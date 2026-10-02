import { describe, expect, test } from 'bun:test';
import {
  buildConditionFlag,
  createConditionInstance,
  projectedConditionStatusId,
} from '@fvtt-json-generator/contracts/conditions';
import { createConditionManagerApplicationClass } from '../src/manager.ts';
import { buildConditionTooltip, decorateConditionHud } from '../src/hud.ts';
import {
  conditionNameOverride,
  displayConditionDescription,
  displayConditionName,
  localizedConditionDescription,
  localizedConditionStatusLabel,
} from '../src/localization.ts';
import { ConditionRuntime, registerConditionMappings } from '../src/runtime.ts';

function i18n(translations: Record<string, string> = {}, lang = 'en'): any {
  return {
    lang,
    localize: (key: string) => translations[key] ?? key,
    format: (key: string, values: Record<string, unknown>) => (translations[key] ?? key)
      .replaceAll('{stacks}', String(values.stacks ?? ''))
      .replaceAll('{max}', String(values.max ?? '')),
  };
}

function actor(id = 'target', effects: any[] = []): any {
  const data: any = {
    id,
    uuid: `Actor.${id}`,
    name: id,
    documentName: 'Actor',
    effects,
    flags: {},
  };
  return {
    ...data,
    async createEmbeddedDocuments(_type: string, entries: any[]) {
      const created = entries.map((entry, index) => ({ ...structuredClone(entry), id: `effect-${index}`, parent: this }));
      data.effects.push(...created);
      return created;
    },
    async updateEmbeddedDocuments(_type: string, updates: any[]) {
      for (const update of updates) Object.assign(data.effects.find((entry: any) => entry.id === update._id) ?? {}, update);
      return data.effects;
    },
    async deleteEmbeddedDocuments(_type: string, ids: string[]) {
      data.effects = data.effects.filter((entry: any) => !ids.includes(entry.id));
      this.effects = data.effects;
      return [];
    },
  };
}

function globalsFor(overrides: Record<string, unknown> = {}): any {
  const gm = { id: 'gm', isGM: true, active: true, targets: new Set() };
  return {
    game: { user: gm, users: { activeGM: gm }, i18n: i18n(), modules: { get: () => undefined }, ...overrides.game as any },
    CONFIG: { statusEffects: [], DND5E: { conditionEffects: { noMovement: new Set(), halfMovement: new Set() } }, ...overrides.CONFIG as any },
    Hooks: { on: () => 'hook', off: () => {} },
    ...overrides,
  };
}

describe('condition presentation', () => {
  test('renders the installed dnd5e rule hierarchy without an image or repeated condition name', () => {
    const content = buildConditionTooltip({
      title: '恍惚', label: 'Dazed', description: '移动或执行动作。', category: '状态',
      bilingual: true, img: 'unsafe" onerror="alert(1)',
    });
    expect(content).toBe('<section class="content"><section class="header"><h2>恍惚 Dazed</h2><ul class="pills"><li class="pill condition">状态</li></ul></section><section class="description"><p>移动或执行动作。</p></section></section>');
    expect(content).not.toContain('<img');
    expect(content).not.toContain('pill transparent');
  });

  test('escapes every user-facing rule field and keeps formula within description', () => {
    const content = buildConditionTooltip({
      title: '<script>x</script>', label: '<Dazed>', category: '<Condition>',
      description: '<img src=x onerror=alert(1)>', bilingual: true,
      formula: '<svg/onload=alert(1)>', formulaLabel: '<Jinxed>',
    });
    expect(content).not.toContain('<script>');
    expect(content).not.toContain('<img');
    expect(content).not.toContain('<svg');
    expect(content).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(content).toContain('<h2>&lt;script&gt;x&lt;/script&gt; &lt;Dazed&gt;</h2>');
    expect(content).toContain('&lt;Condition&gt;');
    expect(content).toContain('<section class="description"><p>&lt;img src=x onerror=alert(1)&gt;</p><p class="fvtt-custom-conditions-formula"><strong>&lt;Jinxed&gt;:</strong> &lt;svg/onload=alert(1)&gt;</p></section>');
  });

  test('shows composite rules in separate escaped paragraphs', () => {
    const content = buildConditionTooltip({
      title: '冻结', label: 'Frozen', category: '状态', bilingual: true,
      description: '速度变为 0。\n\n针对你的攻击具有优势。\n\n<weapon> 命中视为重击。',
    });
    expect(content).toContain('<section class="description"><p>速度变为 0。</p><p>针对你的攻击具有优势。</p><p>&lt;weapon&gt; 命中视为重击。</p></section>');
    expect(content).not.toContain('<weapon>');
  });

  test('keeps localized status names concise and composite effects self-contained', async () => {
    const [zh, en] = await Promise.all([
      Bun.file(new URL('../src/lang/zh-CN.json', import.meta.url)).json(),
      Bun.file(new URL('../src/lang/en.json', import.meta.url)).json(),
    ]);
    expect(projectedConditionStatusId('dazed')).toBe('fvtt-custom-conditions.dazed');
    expect(zh['FVTTCONDITIONS.Condition.dazed.StatusName']).toBe('恍惚');
    expect(en['FVTTCONDITIONS.Condition.dazed.StatusName']).toBe('Dazed');
    const frozen = zh['FVTTCONDITIONS.Condition.frozen.Description'] as string;
    expect(frozen).toContain('速度变为 0');
    expect(frozen).toContain('攻击检定具有优势');
    expect(frozen).toContain('造成钝击伤害的武器');
    expect(frozen).toContain('命中都视为重击');
    expect(frozen).toContain('钝击或火焰伤害');
    const shocked = zh['FVTTCONDITIONS.Condition.shocked.Description'] as string;
    expect(zh['FVTTCONDITIONS.Condition.shocked.Name']).toBe('震愕');
    expect(shocked).toContain('移动、执行动作或执行附赠动作三者中选择一项');
    expect(shocked).toContain('攻击检定具有优势');
    expect(shocked).toContain('拿取、拔出或收起');
    expect(zh['FVTTCONDITIONS.Condition.valor.Description']).toContain('额外掷 X 并将该骰值加到结果中');
    expect(en['FVTTCONDITIONS.Condition.valor.Description']).toContain('roll X and add the result');
    expect(zh['FVTTCONDITIONS.Condition.weakened.Description']).toContain('向下取整');
    expect(en['FVTTCONDITIONS.Condition.weakened.Description']).toContain('rounding the result down');
  });

  test('renders earlier persisted defaults with current copy and keeps authored text', async () => {
    const zh = await Bun.file(new URL('../src/lang/zh-CN.json', import.meta.url)).json();
    const globals = globalsFor({ game: { i18n: i18n(zh, 'cn') } });
    const oldDescriptions = {
      frozen: '同时获得 Immobilized 与 Defenseless；对使用钝击伤害武器的攻击还视为 Helpless。',
      shocked: '同时视为 Dazed 与 Defenseless，并立刻掉落手中物品。拿取或拔出物品需要 1 Action。',
      staggered: '自己的回合内最多只能进行一次 weapon attack。',
      valor: '将条件指定的骰加入攻击检定与豁免检定。',
      weakened: '武器攻击与法术造成的伤害减半。',
    } as const;
    for (const [id, oldDescription] of Object.entries(oldDescriptions)) {
      const conditionId = id as keyof typeof oldDescriptions;
      const params: Record<string, string | number> = {};
      if (conditionId === 'frozen') params.escapeDC = 12;
      if (conditionId === 'valor') params.formula = '1d4';
      const instance = createConditionInstance(conditionId, params);
      const legacy = { name: conditionId === 'shocked' ? '电击' : id, description: oldDescription };
      expect(displayConditionDescription(legacy, instance, globals)).toBe(zh[`FVTTCONDITIONS.Condition.${id}.Description`]);
      expect(displayConditionDescription({ description: `GM: ${oldDescription}` }, instance, globals)).toBe(`GM: ${oldDescription}`);
      if (id === 'shocked') {
        expect(displayConditionName(legacy, instance, globals)).toBe('震愕');
        expect(conditionNameOverride(legacy, conditionId, globals)).toBeUndefined();
        expect(displayConditionName({ name: '电击：自定义' }, instance, globals)).toBe('电击：自定义');
      }
    }
  });

  test('recognizes exact descriptions from the prior Chinese language pack', async () => {
    const zh = await Bun.file(new URL('../src/lang/zh-CN.json', import.meta.url)).json();
    const globals = globalsFor({ game: { i18n: i18n(zh, 'cn') } });
    const priorLocale = {
      frozen: '同时获得定身与无防备；对使用钝击伤害武器的攻击还视为无助。',
      shocked: '同时视为恍惚与无防备，并立刻掉落手中物品。拿取或拔出物品需要 1 个动作。',
      staggered: '自己的回合内最多只能进行一次武器攻击。',
    } as const;
    for (const [id, description] of Object.entries(priorLocale)) {
      const conditionId = id as keyof typeof priorLocale;
      const instance = createConditionInstance(conditionId, id === 'frozen' ? { escapeDC: 12 } : {});
      expect(displayConditionDescription({ description }, instance, globals)).toBe(zh[`FVTTCONDITIONS.Condition.${id}.Description`]);
      expect(displayConditionDescription({ description: `GM: ${description}` }, instance, globals)).toBe(`GM: ${description}`);
    }
    const oldDazed = '自己的回合中只能在移动和执行动作之间选择一个，且不能执行附赠动作。';
    const oldShocked = `${oldDazed}\n\n针对你的攻击检定具有优势。\n\n立刻掉落手中物品；拿取、拔出或收起物品都需要 1 个动作。`;
    for (const [conditionId, description] of [['dazed', oldDazed], ['shocked', oldShocked]] as const) {
      const instance = createConditionInstance(conditionId, {});
      expect(displayConditionDescription({ description }, instance, globals)).toBe(zh[`FVTTCONDITIONS.Condition.${conditionId}.Description`]);
      expect(displayConditionDescription({ description: `GM: ${description}` }, instance, globals)).toBe(`GM: ${description}`);
    }
  });

  test('separates Frozen removal routes and upgrades the previous four-paragraph defaults', async () => {
    const [zh, en] = await Promise.all([
      Bun.file(new URL('../src/lang/zh-CN.json', import.meta.url)).json(),
      Bun.file(new URL('../src/lang/en.json', import.meta.url)).json(),
    ]);
    const previous = {
      zh: '速度变为 0，且不能受益于任何速度加值。飞行中的目标会坠落。\n\n针对你的攻击检定具有优势。\n\n使用造成钝击伤害的武器攻击你时，任何命中都视为重击。\n\n目标或另一生物可用 1 个动作进行力量（运动）检定，通过该状态标注的 DC 后解除；累计受到该状态指定阈值（默认 20 点）的钝击或火焰伤害也会解除。',
      en: "Your Speed becomes 0, and you cannot benefit from any bonus to your Speed. If you are flying, you fall.\n\nAttack rolls against you have advantage.\n\nWhen you are attacked with a weapon that deals bludgeoning damage, any hit against you is a Critical Hit.\n\nYou or another creature can spend 1 Action to make a Strength (Athletics) check against the condition's listed DC to end it. It also ends once you have taken the condition's listed cumulative bludgeoning or fire damage threshold (20 by default).",
    };
    const instance = createConditionInstance('frozen', { escapeDC: 12 });
    for (const [lang, translations] of [['cn', zh], ['en', en]] as const) {
      const globals = globalsFor({ game: { i18n: i18n(translations, lang) } });
      const current = localizedConditionDescription('frozen', globals);
      expect(current.split('\n\n')).toHaveLength(5);
      expect(buildConditionTooltip({ title: 'Frozen', label: 'Frozen', description: current }).match(/<p>/g)).toHaveLength(5);
      expect(displayConditionDescription({ description: previous[lang === 'cn' ? 'zh' : 'en'] }, instance, globals)).toBe(current);
      const authored = `GM: ${previous[lang === 'cn' ? 'zh' : 'en']}`;
      expect(displayConditionDescription({ description: authored }, instance, globals)).toBe(authored);
    }
    expect(zh['FVTTCONDITIONS.Condition.frozen.Description']).toContain('默认 20 点');
    expect(en['FVTTCONDITIONS.Condition.frozen.Description']).toContain('20 by default');
    expect(localizedConditionDescription('frozen', globalsFor()).split('\n\n')).toHaveLength(5);
  });

  test('uses updated English descriptions and plain Dazed status name without i18n', () => {
    const globals = globalsFor();
    expect(localizedConditionStatusLabel('dazed', globals)).toBe('Dazed');
    expect(localizedConditionDescription('frozen', globals)).toContain('Your Speed becomes 0');
    expect(localizedConditionDescription('shocked', globals)).toContain('choose one: move, take an Action, or take a Bonus Action');
    expect(localizedConditionDescription('staggered', globals)).toContain('weapon or unarmed attack');
    expect(localizedConditionDescription('valor', globals)).toContain('roll X and add the result');
    expect(localizedConditionDescription('weakened', globals)).toContain('rounding the result down');
    const oldDescriptions = {
      frozen: 'You also have Immobilized and Defenseless; attacks using weapons that deal bludgeoning damage also treat you as Helpless.',
      shocked: 'You also count as Dazed and Defenseless, and immediately drop held items. Picking up or drawing an item requires 1 Action.',
      staggered: 'On your turn, you can make at most one weapon attack.',
      valor: "Add the condition's specified die to attack rolls and saving throws.",
      weakened: 'Damage from weapon attacks and spells is halved.',
    } as const;
    for (const [id, description] of Object.entries(oldDescriptions)) {
      const conditionId = id as keyof typeof oldDescriptions;
      const params: Record<string, string | number> = {};
      if (conditionId === 'frozen') params.escapeDC = 12;
      if (conditionId === 'valor') params.formula = '1d4';
      const instance = createConditionInstance(conditionId, params);
      expect(displayConditionDescription({ description }, instance, globals)).toBe(localizedConditionDescription(conditionId, globals));
    }
  });

  test('localizes new instances and falls back to complete English text', async () => {
    const cnGlobals = globalsFor({
      game: {
        i18n: i18n({
          'FVTTCONDITIONS.Condition.dazed.Name': '恍惚',
          'FVTTCONDITIONS.Condition.dazed.Description': '自己的回合中只能在移动、执行动作或执行附赠动作三者中选择一项。',
        }, 'cn'),
      },
    });
    const cnRuntime = new ConditionRuntime(cnGlobals, () => true);
    const cnTarget = actor('cn-target');
    const cnEffect = await cnRuntime.apply(cnTarget, 'dazed', {});
    expect(cnEffect).toMatchObject({
      name: '恍惚',
      description: '自己的回合中只能在移动、执行动作或执行附赠动作三者中选择一项。',
      img: 'modules/fvtt-custom-conditions/icons/dazed.svg',
    });

    const enRuntime = new ConditionRuntime(globalsFor(), () => true);
    const enTarget = actor('en-target');
    const enEffect = await enRuntime.apply(enTarget, 'dazed', {});
    expect(enEffect.name).toBe('Dazed');
    expect(enEffect.description).toContain('choose one: move, take an Action, or take a Bonus Action');
  });

  test('keeps native same-ID registration and decorates only owned HUD actions', () => {
    const native = { id: 'bleeding', name: 'Native Bleeding', reference: 'native-reference' };
    const globals = globalsFor({ CONFIG: { statusEffects: [native] } });
    registerConditionMappings(globals);
    expect(globals.CONFIG.statusEffects.find((entry: any) => entry.id === 'bleeding')).toEqual(native);
    const ownAction = { id: projectedConditionStatusId('addled'), name: 'Addled', system: { actionType: 'condition', actionId: projectedConditionStatusId('addled') }, tooltip: 'old' };
    const nativeAction = { id: 'bleeding', name: 'Native Bleeding', system: { actionType: 'condition', actionId: 'bleeding' }, tooltip: 'native' };
    const hud = { groups: [{ actions: [ownAction, nativeAction] }] };
    decorateConditionHud(hud, globals, { setting: { tooltips: 'full' } });
    expect((ownAction.tooltip as any).class).toContain('rule-tooltip fvtt-custom-conditions-rule-tooltip');
    expect((ownAction.tooltip as any).class.includes('effect-tooltip')).toBe(false);
    expect((ownAction.tooltip as any).content).toContain('Intelligence, Wisdom, and Charisma');
    expect(nativeAction.tooltip).toBe('native');

    const replaced = { id: projectedConditionStatusId('addled'), name: 'Native Addled', reference: 'native-addled-reference' };
    globals.CONFIG.statusEffects = globals.CONFIG.statusEffects.map((entry: any) => entry.id === projectedConditionStatusId('addled') ? replaced : entry);
    registerConditionMappings(globals);
    const replacedAction = { name: 'Native Addled', system: { actionType: 'condition', actionId: projectedConditionStatusId('addled') }, tooltip: 'native-after-rebuild' };
    decorateConditionHud({ groups: [{ actions: [replacedAction] }] }, globals, { setting: { tooltips: 'full' } });
    expect(replacedAction.tooltip).toBe('native-after-rebuild');
  });

  test('uses a bilingual Chinese title and the localized condition category only in full mode', () => {
    const globals = globalsFor({ game: { i18n: i18n({
      'FVTTCONDITIONS.Condition.dazed.Name': '恍惚',
      'FVTTCONDITIONS.Condition.dazed.Description': '移动或执行动作。',
      'FVTTCONDITIONS.Manager.Condition': '状态',
    }, 'cn') } });
    registerConditionMappings(globals);
    const action = { name: 'Dazed', system: { actionType: 'condition', actionId: projectedConditionStatusId('dazed') }, tooltip: 'old' };
    const hud = { groups: [{ actions: [action] }] };
    decorateConditionHud(hud, globals, { setting: { tooltips: 'full' } });
    expect((action.tooltip as any).content).toContain('<h2>恍惚 Dazed</h2>');
    expect((action.tooltip as any).content).toContain('<li class="pill condition">状态</li>');
    decorateConditionHud(hud, globals, { setting: { tooltips: 'nameOnly' } });
    expect(action.tooltip as any).toEqual({ content: 'Dazed' });
    decorateConditionHud(hud, globals, { setting: { tooltips: 'none' } });
    expect(action.tooltip).toBeNull();
  });

  test('preserves a custom instance name while localizing a legacy English default name', async () => {
    const globals = globalsFor({
      game: {
        i18n: i18n({
          'FVTTCONDITIONS.Condition.dazed.Name': '恍惚',
          'FVTTCONDITIONS.Condition.dazed.Description': '自己的回合中只能在移动、执行动作或执行附赠动作三者中选择一项。',
        }, 'cn'),
      },
    });
    const runtime = new ConditionRuntime(globals, () => true);
    const target = actor();
    await runtime.apply(target, 'dazed', {}, { name: '我的自定义标签' });
    expect(runtime.list(target)[0]?.name).toBe('我的自定义标签');

    const legacy = actor('legacy', [{
      id: 'legacy-effect',
      name: 'Dazed',
      description: 'On your turn, choose between moving and taking an Action, and you cannot take a Bonus Action.',
      flags: { 'fvtt-custom-conditions': { condition: buildConditionFlag(createConditionInstance('dazed', {}))['fvtt-custom-conditions']!.condition } },
    }]);
    expect(runtime.list(legacy)[0]?.name).toBe('恍惚');
    expect(runtime.list(legacy)[0]?.description).toContain('自己的回合中');
  });

  test('honors Token Action HUD none and nameOnly tooltip modes', () => {
    const globals = globalsFor();
    registerConditionMappings(globals);
    const none = { name: 'Addled', system: { actionType: 'condition', actionId: projectedConditionStatusId('addled') }, tooltip: 'old' };
    decorateConditionHud({ groups: [{ actions: [none] }] }, globals, { setting: { tooltips: 'none' } });
    expect(none.tooltip).toBeNull();
    const nameOnly = { name: '<custom>', system: { actionType: 'condition', actionId: projectedConditionStatusId('addled') }, tooltip: 'old' };
    decorateConditionHud({ groups: [{ actions: [nameOnly] }] }, globals, { setting: { tooltips: 'nameOnly' } });
    expect(nameOnly.tooltip as any).toEqual({ content: '&lt;custom&gt;' });
  });
});

describe('optional injury manager integration', () => {
  function setup(active: boolean, initialStacks = 2, setInjuryBehavior?: (args: any[], apply: () => void) => unknown) {
    const target = actor('injured');
    const calls: any[] = [];
    let stacks = initialStacks;
    const injury = {
      getState: () => ({ stacks }),
      setStacks: (...args: any[]) => {
        calls.push(['set', ...args]);
        const apply = () => { stacks = Number(args[1]); };
        return setInjuryBehavior ? setInjuryBehavior(args, apply) : apply();
      },
    };
    const fading = { openResurrectionWizard: (...args: any[]) => { calls.push(['wizard', ...args]); } };
    const gm = { id: 'gm', isGM: true, active: true, targets: new Set([{ actor: target }]) };
    const globals: any = {
      foundry: { applications: { api: { ApplicationV2: class { async render() {} } } } },
      game: {
        user: gm,
        i18n: i18n({ 'FVTTCONDITIONS.Injury.Name': '伤势', 'FVTTCONDITIONS.Injury.Level': '伤势 {stacks}/{max}' }, 'cn'),
        modules: { get: (id: string) => id === 'fvtt-injury-fading-spirits' ? { active, api: fading }
          : id === 'fvtt-custom-conditions' ? { active, api: { injury } } : undefined },
      },
      canvas: { tokens: { controlled: [] } },
      ui: { notifications: { error: () => {} } },
    };
    const Application = createConditionManagerApplicationClass({ list: () => [] } as any, globals);
    return { Application, manager: new Application(), target, calls, globals, getStacks: () => stacks };
  }

  test('shows public injury API state and routes manager controls without condition flags', async () => {
    const { Application, manager, target, calls } = setup(true);
    const context = await manager._prepareContext();
    expect(context.injury).toMatchObject({ enabled: true, name: '伤势', actors: [{ stacks: 2, maxStacks: 3 }] });
    await Application.increaseInjury.call(manager, undefined, { dataset: { actorUuid: target.uuid } });
    await Application.openInjuryWizard.call(manager, undefined, { dataset: { actorUuid: target.uuid } });
    expect(calls[0]).toEqual(['set', target, 3, 'custom-conditions-manager']);
    expect(calls[1]).toEqual(['wizard', target]);
  });

  test('uses actor-independent manager guidance while two Actors retain distinct localized levels', async () => {
    const { manager, target, globals } = setup(true);
    const other = actor('second-injured');
    manager.actors = [target, other];
    globals.game.modules.get = (id: string) => id === 'fvtt-custom-conditions'
      ? { active: true, api: { injury: { getState: (selected: any) => ({ stacks: selected.uuid === target.uuid ? 1 : 3 }),
        setStacks: async () => {} } } } : undefined;
    for (const [lang, expected] of [['zh-CN', '伤势'], ['en', 'Injury']] as const) {
      const translations = await Bun.file(new URL(`../src/lang/${lang}.json`, import.meta.url)).json();
      globals.game.i18n = i18n(translations, lang);
      const injury = (await manager._prepareContext()).injury;
      expect(injury.description).toContain('0–3');
      expect(injury.description).not.toMatch(/\{(?:stacks|max)\}/);
      expect(injury.actors.map((entry: any) => entry.stacks)).toEqual([1, 3]);
      expect(injury.actors.map((entry: any) => entry.description)).toEqual([`${expected} 1/3`, `${expected} 3/3`]);
    }
  });

  test('hides the optional injury area when its module is inactive', async () => {
    const { manager } = setup(false);
    expect((await manager._prepareContext()).injury).toMatchObject({ enabled: false });
  });

  test('one malformed injury Actor leaves the manager renderable', async () => {
    const { manager, globals } = setup(true);
    globals.game.modules.get = (id: string) => id === 'fvtt-custom-conditions'
      ? { active: true, api: { injury: { getState: () => { throw new Error('Unknown injury schema'); }, setStacks: async () => {} } } }
      : undefined;
    const context = await manager._prepareContext();
    expect(context.injury.enabled).toBeTrue();
    expect(context.injury.actors[0].error).toBe('Unknown injury schema');
    expect(context.definitions.length).toBeGreaterThan(0);
  });

  test('serializes rapid injury changes after the prior write resolves', async () => {
    let releaseFirst: (() => void) | undefined;
    let firstSetStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => { firstSetStarted = resolve; });
    const { Application, manager, target, calls, getStacks } = setup(true, 0, (args, apply) => {
      if (calls.filter((entry) => entry[0] === 'set').length === 1) {
        firstSetStarted();
        return new Promise<void>((resolve) => {
          releaseFirst = () => { apply(); resolve(); };
        });
      }
      apply();
    });
    const button = { dataset: { actorUuid: target.uuid } };
    const first = Application.increaseInjury.call(manager, undefined, button);
    await firstStarted;
    const second = Application.increaseInjury.call(manager, undefined, button);
    expect(calls.filter((entry) => entry[0] === 'set').map((entry) => entry[2])).toEqual([1]);
    releaseFirst!();
    await Promise.all([first, second]);
    expect(calls.filter((entry) => entry[0] === 'set').map((entry) => entry[2])).toEqual([1, 2]);
    expect(getStacks()).toBe(2);

    await Application.decreaseInjury.call(manager, undefined, button);
    expect(calls.filter((entry) => entry[0] === 'set').map((entry) => entry[2])).toEqual([1, 2, 1]);
    expect(getStacks()).toBe(1);
  });

  test('a failed injury write does not block the next queued change', async () => {
    let attempts = 0;
    const { Application, manager, target, calls, getStacks } = setup(true, 0, (_args, apply) => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary injury write failure');
      apply();
    });
    const button = { dataset: { actorUuid: target.uuid } };
    await Promise.all([
      Application.increaseInjury.call(manager, undefined, button),
      Application.increaseInjury.call(manager, undefined, button),
    ]);
    expect(calls.filter((entry) => entry[0] === 'set').map((entry) => entry[2])).toEqual([1, 1]);
    expect(getStacks()).toBe(1);
  });
});
