import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

test('real clone and migration reproduce the enchantment failure and validate the narrow candidate', () => {
  const report = JSON.parse(execFileSync('F:/FoundryLab/foundry-v14/runtime/node-v24.17.0-win-x64/node.exe',
    [resolve(import.meta.dir, 'helpers/enchantment-clone-probe.mjs')], {encoding: 'utf8', timeout: 30_000}));
  expect(report.observations).toHaveLength(7);
  expect(report.negativeControl.type).toBe('condition');
  expect(report.fixed.type).toBe('enchantment');
  expect(report.fixed._id).not.toBe(report.fixed.flags.dnd5e.enchantmentProfile);
});
