import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PlainTextAuditWorkflow, validateAction } from '../plaintextAudit';

describe('PlainTextAuditWorkflow', () => {
  const testDir = join(process.cwd(), 'temp_audit_test');
  const sourcePath = 'test-source.md';

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    const reportPath = join(process.cwd(), 'audits');
    // We don't want to delete the whole audits dir if it exists, 
    // but we might want to clean up our test report.
    // For now, let's just leave it or be specific if we knew the name.
  });

  describe('validateAction', () => {
    it('should return no issues for a valid action', () => {
      const action = {
        名称: '测试攻击',
        类型: 'attack',
        攻击类型: 'mwak',
        命中: '+5',
        范围: '触及5尺',
        伤害: [{ 公式: '1d6+3', 类型: '钝击' }],
        目标: { 数量: '1', 类型: 'creature' }
      };
      const issues = validateAction(action, '测试生物', '动作', 0);
      expect(issues).toHaveLength(0);
    });

    it('should detect invalid action type', () => {
      const action = {
        名称: '测试攻击',
        类型: 'invalid_type'
      };
      const issues = validateAction(action, '测试生物', '动作', 0);
      expect(issues.some(i => i.reason === '无效的动作类型')).toBe(true);
    });

    it('should detect missing attack type for attack actions', () => {
      const action = {
        名称: '测试攻击',
        类型: 'attack'
      };
      const issues = validateAction(action, '测试生物', '动作', 0);
      expect(issues.some(i => i.reason.includes('缺少有效的攻击类型'))).toBe(true);
    });

    it('should detect invalid target type', () => {
      const action = {
        名称: '测试攻击',
        类型: 'utility',
        目标: { 类型: 'space' }
      };
      const issues = validateAction(action, '测试生物', '动作', 0);
      expect(issues.some(i => i.reason.includes('目标类型不符合 FVTT 标准'))).toBe(true);
    });

    it('should detect missing damage formula', () => {
      const action = {
        名称: '测试攻击',
        类型: 'attack',
        攻击类型: 'mwak',
        伤害: [{ 类型: '钝击' }]
      };
      const issues = validateAction(action, '测试生物', '动作', 0);
      expect(issues.some(i => i.reason === '伤害条目缺少公式')).toBe(true);
    });
  });

  describe('audit workflow', () => {
    it('should process files in middleDir and generate a report', () => {
      const creatureMd = `---
名称: 蛇口蛮蟹
动作:
  - 名称: 钩握螯
    类型: attack
    攻击类型: mwak
    命中: "+8"
    范围: 触及10尺
    目标:
      数量: "1"
      类型: creature
---
### 动作
钩握螯攻击。
`;
      writeFileSync(join(testDir, 'serpentmaw.md'), creatureMd);

      const workflow = new PlainTextAuditWorkflow();
      const result = workflow.audit(testDir, sourcePath);

      expect(result.creatureCount).toBe(1);
      expect(result.issues).toHaveLength(0);
      expect(existsSync(result.reportPath)).toBe(true);
    });

    it('should report issues from multiple files', () => {
      const creature1 = `---
名称: 错误生物
动作:
  - 名称: 坏动作
    类型: wrong
---
`;
      const creature2 = `---
名称: 警告生物
动作:
  - 名称: 警告动作
    类型: utility
    目标:
      类型: space
---
`;
      writeFileSync(join(testDir, 'c1.md'), creature1);
      writeFileSync(join(testDir, 'c2.md'), creature2);

      const workflow = new PlainTextAuditWorkflow();
      const result = workflow.audit(testDir, sourcePath);

      expect(result.creatureCount).toBe(2);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(i => i.severity === 'error')).toBe(true);
      expect(result.issues.some(i => i.severity === 'warning')).toBe(true);
    });
  });
});
