# Plan: Fix Item Generation Bugs

## TL;DR

修复物品拆分和伤害公式解析的bug。

> **Quick Summary**: 修复3个问题：1) 拆分时frontmatter缺少名称 2) 拆到了模板内容 3) 伤害公式解析错误

> **Deliverables**:
> - 修复 `src/core/ingest/items.ts` - frontmatter添加名称，忽略模板
> - 修复 `src/core/parser/item-parser.ts` - 伤害公式解析

> **Estimated Effort**: Small
> **Parallel Execution**: YES - 两个文件独立修复
> **Critical Path**: items.ts修复 → 测试验证 → parser修复 → 测试验证

---

## Context

### 问题1: 三祷之坠 - "Unknown Item"
- **现象**: 生成的JSON name是 "Unknown Item"，description是 "The abacus..."
- **原因**: 
  - frontmatter只有 `layout: item`，缺少 `名称` 字段
  - 拆到了模板里的"算盘"示例内容

### 问题2: 骑士之盾 - 伤害公式错误
- **现象**: Foundry导入报错 "Unresolved StringTerm 你力量调整值的"
- **原因**: `parseAttackDamage()` 用 `(?<=的)` 后瞻断言匹配中文，错误提取了"你力量调整值的"

---

## Work Objectives

### 问题1修复 - items.ts

**当前frontmatter**:
```yaml
---
layout: item
---
```

**应改为**:
```yaml
---
layout: item
名称: 三祷之坠
英文名: Jewel of Three Prayers
类型: 奇物
---
```

**修复点**:
1. `ItemsIngestionWorkflow.ingest()` 生成frontmatter时添加 `名称` 和 `英文名`
2. `splitItemCollection()` 忽略 `# 物品模版` 和 `# 下面是两个示例物品` 开头的块

### 问题2修复 - item-parser.ts

**当前错误代码** (`parseAttackDamage`):
```typescript
// 这个正则有问题 (?<=的) 会匹配到"你力量调整值的"
const damagePattern = /(?<=的)([\u4e00-\u9fa5]+)伤害|(\d+d\d+(?:\s*[+\-]\s*\d+)*)\s*(?:点?)?([\u4e00-\u9fa5]+)伤害/gi;
```

**应改为**:
只匹配 `NdN±N类型` 格式，不使用后瞻断言

---

## TODOs

- [ ] 1. **修复frontmatter添加名称** — `src/core/ingest/items.ts`

  **What to do**:
  修改 `ItemsIngestionWorkflow.ingest()` 的 frontmatter 生成逻辑:

  ```typescript
  // 当前 (line 31)
  const frontmatter = '---\nlayout: item\n---\n';
  
  // 应改为
  const frontmatter = `-----
  layout: item
  名称: ${block.chineseName}
  英文名: ${block.englishName}
  ---
  `;
  ```

  **Verification**:
  重新运行拆分命令，检查输出的markdown文件frontmatter包含正确的名称

---

- [ ] 2. **修复忽略模板内容** — `src/core/ingest/items.ts`

  **What to do**:
  修改 `splitItemCollection()` 忽略模板部分:

  ```typescript
  // 在 headingPattern 匹配后，过滤掉模板标题
  const validMatches = matches.filter(match => {
    const heading = match[1]?.trim() || '';
    // 跳过模板标题
    if (heading.includes('物品模版') || heading.includes('下面是两个示例物品')) {
      return false;
    }
    // 跳过只有"英文名"或"物品名"的模板行
    if (heading === '物品名（English Name）' || heading === '物品名') {
      return false;
    }
    return true;
  });
  ```

  **Verification**:
  重新运行拆分，`english-name__物品名` 文件不应再出现

---

- [ ] 3. **修复伤害公式解析** — `src/core/parser/item-parser.ts`

  **What to do**:
  修改 `parseAttackDamage()` 移除后瞻断言:

  ```typescript
  // 当前 (line 563)
  const damagePattern = /(?<=的)([\u4e00-\u9fa5]+)伤害|(\d+d\d+(?:\s*[+\-]\s*\d+)*)\s*(?:点?)?([\u4e00-\u9fa5]+)伤害/gi;
  
  // 应改为 - 只匹配NdN格式，不解析中文伤害类型
  const damagePattern = /(\d+d\d+(?:\s*[+\-]\s*(?:\d+|str|dex|con|int|wis|cha))+)\s*(?:点)?([\u4e00-\u9fa5]+)?/gi;
  ```

  **或者更简单的方案** - 只提取 `NdN±N` 部分，中文类型单独处理:
  ```typescript
  // 匹配 NdN±N 格式
  const formulaPattern = /(\d+d\d+(?:\s*[+\-]\s*\d+)*)/gi;
  // 单独匹配中文伤害类型
  const typePattern = /([\u4e00-\u9fa5]+)伤害/gi;
  ```

  **Must NOT do**:
  - 不改动 ActivityGenerator 相关逻辑

  **Verification**:
  ```bash
  # 重新生成骑士之盾JSON
  bun run src/index.ts "middle/items/shield-of-the-cavalier__骑士之盾.md" -o temp/shield-test.json
  
  # 检查damage.parts[0].formula 应该是 "2d6+2" 而不是 "2d6 + 2 + 你力量调整值的"
  ```

---

- [ ] 4. **重新E2E测试**

  **What to do**:
  1. 删除旧的middle/output目录
  2. 重新拆分物品
  3. 生成JSON
  4. 验证名称正确、公式正确

---

## Final Verification Wave

- [ ] F1. **三祷之坠名称正确** — 检查JSON中 name 不是 "Unknown Item"
- [ ] F2. **骑士之盾公式正确** — 检查damage.parts没有中文
- [ ] F3. **模板文件未生成** — english-name__物品名 文件不应存在

---

## Commit Strategy

- **1**: `fix(items): add name to frontmatter and ignore template`
- **2**: `fix(item-parser): correct damage formula regex`

---

## Success Criteria

```bash
# 1. 拆分后文件包含正确frontmatter
# middle/items/jewel-of-three-prayers__三祷之坠 (Dormant State).md 应包含:
# ---
# layout: item
# 名称: 三祷之坠
# 英文名: Jewel of Three Prayers
# ---

# 2. 骑士之盾伤害公式正确
# output/items/shield-of-the-cavalier__骑士之盾.json 中
# damage.parts[0].formula 应为 "2d6+2" (不含中文)

# 3. 没有模板文件
# ls middle/items/ 不应包含 "english-name__物品名"
```
