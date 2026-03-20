# Phase 1 Test Plan: Generated JSON 验证用例

基于 session `ses_30901cc07ffed0efrlM2DPXYLa` 的实际生成输出分析，以下是从该 session 中提取的 **Phase 1 测试用例**。每个用例对应一个需要自动验证的问题点。

---

## 测试输入文件

| 文件 | 语言路线 | 特性覆盖 |
|------|---------|---------|
| `input/chuul-nullifier.md` | 中文 | 伤害免疫、状态免疫、多动作、感知魔法 |
| `input/chuul-screecher.md` | 中文 | 充能能力、状态效果 |
| `input/chuul-incubator.md` | 中文 | 召唤能力 |
| `input/slithering-bloodfin.md` | 中文 | 附赠动作、反应、1/日能力、多段伤害、流血/恍惚效果 |

---

## Test Case 1: Golden Master 模板污染 — flags

**问题**: Golden Master 模板的 `flags`（如 `babele`、`mcdm-flee-mortals-where-evil-lives`、`exportSource`、`_stats`）在生成的 JSON 中未被清理。

**实际表现**:
```json
"flags": {
  "babele": { "translated": true, "hasTranslation": true, "originalName": "Ancient Brass Dragon" },
  "mcdm-flee-mortals-where-evil-lives": { "role": "solo" },
  "exportSource": { "world": "cor-cotn", "system": "dnd5e", "coreVersion": "12.331", "systemVersion": "4.3.9" }
},
"_stats": {
  "createdTime": 1769442424069,
  "modifiedTime": 1769443264235,
  "lastModifiedBy": "FccwB5HfAhy1F49a"
}
```

**验证规则**:
- `actor.flags` 应为空对象 `{}`
- `actor._stats` 应不存在或由生成器重新创建
- `actor.flags.babele` 不应存在
- `actor.flags.mcdm-flee-mortals-where-evil-lives` 不应存在
- `actor.flags.exportSource` 不应存在

**测试断言**:
```typescript
expect(actor.flags).toEqual({});
expect(actor.flags.babele).toBeUndefined();
expect(actor._stats?.lastModifiedBy).not.toBe('FccwB5HfAhy1F49a');
```

---

## Test Case 2: Golden Master 模板污染 — prototypeToken.flags

**问题**: `prototypeToken.flags` 从模板继承。

**验证规则**:
- `actor.prototypeToken.flags` 应为空对象 `{}`
- `actor.prototypeToken.detectionModes` 应为空数组 `[]`
- `actor.prototypeToken.ring.enabled` 应为 `true`（这是 dnd5e 的默认值，OK）
- `actor.prototypeToken.ring.subject.texture` 应为 `null`

**测试断言**:
```typescript
expect(actor.prototypeToken.flags).toEqual({});
expect(actor.prototypeToken.detectionModes).toEqual([]);
```

---

## Test Case 3: Golden Master 模板污染 — folder

**问题**: `folder` 字段从模板继承（值为 `"ZGZiNmEzMjFmNzhh"`，这是 golden-master 导出时的目录 ID）。

**验证规则**:
- `actor.folder` 应为 `null` 或 `undefined`

**测试断言**:
```typescript
expect(actor.folder).toBeFalsy();
```

---

## Test Case 4: img 字段重置

**问题**: `actor.img` 从模板继承（golden-master 可能设置了图片路径）。

**验证规则**:
- `actor.img` 应为空字符串 `""`

**测试断言**:
```typescript
expect(actor.img).toBe('');
```

---

## Test Case 5: 效果绑定 — 特性上的效果不应绑定到无关 Activities

**问题**: `slithering-bloodfin.json` 中 "扭滑" 特性（消耗5尺移动摆脱束缚/擒抱）的 effects 绑定了 `restrained` 和 `grappled` 状态。但这些效果的语义是 "如果你被这个特性影响"，而不是 "这个特性施加这些效果"。

**实际表现**:
```json
{
  "name": "扭滑",
  "type": "feat",
  "system": { "activities": {} },
  "effects": [
    { "name": "束缚 (Restrained)", "statuses": ["restrained"] },
    { "name": "擒抱 (Grappled)", "statuses": ["grappled"] }
  ]
}
```

**验证规则**:
- 被动特性（无 activation.type）的 effects 应为空，除非特性明确描述施加效果
- "扭滑" 描述的是"摆脱"效果，而非"施加"效果

**测试断言**:
```typescript
const niuHua = actor.items.find(i => i.name === '扭滑');
expect(niuHua.system.activation.type).toBe('');
expect(niuHua.effects).toEqual([]);
```

---

## Test Case 6: 1/日能力的 Usage 限制

**问题**: `slithering-bloodfin.json` 中 "远洋尖啸 [1/日]" 的 `activation.type` 设置为 `"reaction"`，但没有设置 `uses` 限制。

**实际表现**:
```json
{
  "name": "远洋尖啸 [1/日]",
  "system": {
    "activation": { "type": "reaction", "cost": 1 }
  }
}
```

**验证规则**:
- 名称包含 `[N/日]` 或 `[1/Day]` 的能力应自动设置 `system.uses`
- `uses.value` 应为 `1`
- `uses.max` 应为 `1`
- `uses.per` 应为 `"lr"`（长休恢复）或 `"day"`

**测试断言**:
```typescript
const xiao = actor.items.find(i => i.name.includes('远洋尖啸'));
expect(xiao.system.uses).toBeDefined();
expect(xiao.system.uses.value).toBe(1);
expect(xiao.system.uses.max).toBe(1);
expect(xiao.system.uses.per).toBeDefined();
```

---

## Test Case 7: 空描述处理

**问题**: `chuul-nullifier.json` 中 "钳击" 的 `description.value` 为 `<p></p>`（空段落）。

**实际表现**:
```json
{
  "name": "钳击",
  "system": {
    "description": { "value": "<p></p>" }
  }
}
```

**验证规则**:
- 攻击动作的描述应包含命中效果文本
- 从 `"12 (2d6+5) 点钝击伤害. 命中：如果目标是大型或更小的生物..."` 提取的描述不应为空

**测试断言**:
```typescript
const pincer = actor.items.find(i => i.name === '钳击');
expect(pincer.system.description.value).not.toBe('<p></p>');
expect(pincer.system.description.value).toContain('钝击');
```

---

## Test Case 8: 语言代码映射

**问题**: `chuul-nullifier.json` 中 `languages.value` 为 `["深渊语"]`（中文），但 Foundry dnd5e 期望的是 `["deep"]`（英文代码）。

**实际表现**:
```json
"traits": {
  "languages": { "value": ["深渊语"], "custom": "" }
}
```

**验证规则**:
- 语言值应映射为 Foundry dnd5e 的标准代码（如 `"deep"`）
- 中文名应存储在 `custom` 字段或其他合适位置

**测试断言**:
```typescript
expect(actor.system.traits.languages.value).toContain('deep');
expect(actor.system.traits.languages.value).not.toContain('深渊语');
```

---

## Test Case 9: 伤害类型代码映射

**问题**: 伤害类型（如 `钝击`、`穿刺`）应映射为 Foundry 标准代码。

**验证规则**:
- `钝击` → `bludgeoning`
- `穿刺` → `piercing`
- `挥砍` → `slashing`
- `毒素` → `poison`
- `死灵` → `necrotic`
- `火焰` → `fire`

**测试断言**:
```typescript
const pincer = actor.items.find(i => i.name === '钳击');
const activity = Object.values(pincer.system.activities)[0];
expect(activity.damage.parts[0].types).toContain('bludgeoning');
expect(activity.damage.parts[0].types).not.toContain('钝击');
```

---

## Test Case 10: 状态免疫代码映射

**问题**: `ci.value` 应映射为 Foundry 标准代码。

**验证规则**:
- `中毒` → `poisoned`
- `恐慌` → `frightened`
- `魅惑` → `charmed`

**测试断言**:
```typescript
expect(actor.system.traits.ci.value).toContain('poisoned');
expect(actor.system.traits.ci.value).not.toContain('中毒');
```

---

## Test Case 11: 伤害免疫代码映射

**问题**: `di.value` 应映射为 Foundry 标准代码。

**验证规则**:
- `毒素` → `poison`
- `火焰` → `fire`
- `冷冻` → `cold`

**测试断言**:
```typescript
expect(actor.system.traits.di.value).toContain('poison');
expect(actor.system.traits.di.value).not.toContain('毒素');
```

---

## Test Case 12: 多段伤害解析

**问题**: 攻击动作包含多种伤害类型时（如 `+14命中, 触及10尺, 2d10+8穿刺 + 2d6火焰`），`damage.parts` 应包含多个条目。

**验证规则**:
- 每种伤害类型应有独立的 `damage.parts` 条目
- 每个条目的 `number`、`denomination`、`bonus` 应正确解析

**测试断言**:
```typescript
// 以 adult red dragon 的 Bite 为例（如果测试文件包含）
const bite = actor.items.find(i => i.name.includes('Bite'));
const activity = Object.values(bite.system.activities)[0];
expect(activity.damage.parts.length).toBeGreaterThanOrEqual(2);
```

---

## Test Case 13: 附赠动作识别

**问题**: `slithering-bloodfin.json` 中 "吞咽" 应识别为附赠动作。

**实际表现**:
```json
{
  "name": "吞咽",
  "system": {
    "activation": { "type": "bonus", "cost": 1 }
  }
}
```

**验证规则**:
- YAML 中 `附赠动作:` 下的动作应自动设置 `activation.type = "bonus"`
- 英文描述包含 "bonus action" 的动作同理

**测试断言**:
```typescript
const swallow = actor.items.find(i => i.name === '吞咽');
expect(swallow.system.activation.type).toBe('bonus');
```

---

## Test Case 14: 反应识别

**问题**: `slithering-bloodfin.json` 中 "滑溜" 和 "远洋尖啸" 应识别为反应。

**验证规则**:
- YAML 中 `反应:` 下的动作应自动设置 `activation.type = "reaction"`
- 英文描述包含 "reaction" 的动作同理

**测试断言**:
```typescript
const slip = actor.items.find(i => i.name === '滑溜');
expect(slip.system.activation.type).toBe('reaction');
```

---

## Test Case 15: bioload 使用金色大师默认值

**问题**: `spells` 字段（如 `spell1` - `spell9`、`pact`）全部从 golden-master 继承，对非施法者无意义。

**验证规则**:
- 非施法者 NPC 的 `spells` 字段应为空或不存在
- 施法者 NPC 的 `spells` 字段应根据实际法术等级设置

**测试断言**:
```typescript
// Chuul Nullifier 是非施法者
expect(Object.values(actor.system.spells).every(s => s.value === 0)).toBe(true);
```

---

## 测试执行方式

### 运行单个测试文件
```bash
bun test src/core/generator/__tests__/phase1-validation.test.ts
```

### 测试结构
```typescript
import { describe, it, expect, beforeAll } from 'bun:test';
import { ActorGenerator } from '../actor';
import { ChineseFrontmatterParser } from '../../parser/chineseFrontmatter';
import { readFileSync } from 'node:fs';

describe('Phase 1: Generated JSON Validation', () => {
  let actor: any;

  beforeAll(() => {
    const parser = new ChineseFrontmatterParser();
    const content = readFileSync('obsidian/dnd数据转fvttjson/input/slithering-bloodfin.md', 'utf-8');
    const parsed = parser.parse(content);
    const generator = new ActorGenerator();
    actor = generator.generate(parsed);
  });

  // Test cases here...
});
```

---

## 优先级排序

| 优先级 | 测试用例 | 影响范围 |
|--------|---------|---------|
| **P0** | #1-4 模板污染 | 所有生成的 JSON |
| **P0** | #8-11 语言/伤害/状态映射 | 中文路线的每个多语言字段 |
| **P1** | #6 1/日能力限制 | 带次数限制的能力 |
| **P1** | #7 空描述 | 攻击动作的可用性 |
| **P2** | #5 效果绑定 | 带效果的特性 |
| **P2** | #12-14 附赠/反应/多段 | 复杂怪物 |
| **P3** | #15 施法字段 | 非施法者 NPC |

---

## 下一步行动

1. **创建测试文件**: `src/core/generator/__tests__/phase1-validation.test.ts`
2. **修复 `resetActorDefaults`**: 清理 `flags`、`_stats`、`folder`
3. **添加语言映射**: 扩展 `cn.json` 或创建专门的映射表
4. **实现 1/日能力解析**: 从动作名称中提取 `[N/日]` 并设置 `uses`
5. **改进描述提取**: 确保攻击动作的命中效果被正确提取到描述字段
