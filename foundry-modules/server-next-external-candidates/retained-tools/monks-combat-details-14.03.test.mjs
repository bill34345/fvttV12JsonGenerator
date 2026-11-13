import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const file = process.env.MONKS_COMBAT_DETAILS_SOURCE;
assert(file, 'Set MONKS_COMBAT_DETAILS_SOURCE to the official 14.03 monks-combat-details.js');
const original = await readFile(file, 'utf8');
const sha = text => createHash('sha256').update(text).digest('hex');
assert.equal(sha(original), '4e3fc30cc98cfcc73f56cb0b3ed46399fb5f8c57f3b88f222db96e630d703852');
const candidate = await applyPatches(file);

async function applyPatches(source) {
  const directory = await mkdtemp(join(tmpdir(), 'monks-combat-14-03-'));
  const output = join(directory, 'monks-combat-details.js');
  try {
    await copyFile(source, output);
    const patches = ['switch-chat', 'initiative-notifications'].map(name =>
      fileURLToPath(new URL(`./monks-combat-details-${name}-14.03.patch`, import.meta.url)));
    const applied = spawnSync('git', ['apply', ...patches], { cwd: directory, encoding: 'utf8' });
    assert.equal(applied.status, 0, applied.stderr || applied.error?.message);
    return await readFile(output, 'utf8');
  } finally {
    await unlink(output).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(directory);
  }
}

test('both patches reproduce the accepted script', () => {
  assert.equal(sha(candidate), 'b7f6ef3138e0d3539b2c098a1c38fddd07dd7eb3d254e8954abff6be73698ba0');
});

function callbackSource(source, anchor) {
  const start = source.indexOf(anchor);
  const end = source.indexOf('\n});', start);
  assert(start >= 0 && end > start);
  return source.slice(start, end + 4);
}

async function switches(source, row) {
  const schedule = [];
  const calls = [];
  let update;
  const sidebar = { tabGroups: { primary: row.tab ?? 'combat' }, changeTab: (...args) => calls.push(args) };
  const register = new Function('Hooks', 'MonksCombatDetails', 'ui', 'setting', 'game', 'setTimeout',
    callbackSource(source, 'Hooks.on("updateCombat", async function (combat, delta) {'));
  register({ on: (_name, fn) => { update = fn; } }, { checkPopout() {} }, { sidebar },
    key => key === 'switch-chat-tab' && row.enabled !== false, { user: { isTheGM: false } },
    (callback, delay) => { assert.equal(delay, 0); schedule.push(callback); });
  await update({ round: row.round, started: true, previous: { round: row.previous } }, row.delta);
  const synchronous = calls.length;
  if (row.leave) sidebar.tabGroups.primary = 'actors';
  for (const callback of schedule) callback();
  for (const call of calls) assert.deepEqual(call, ['chat', 'primary']);
  return { synchronous, total: calls.length };
}

test('only an actual start switches from combat to chat, after the combat update', async () => {
  const start = { round: 1, previous: 0, delta: { round: 1, turn: 0 } };
  const ordinaryTurn = { round: 1, previous: 1, delta: { turn: 1 } };
  assert.deepEqual(await switches(original, ordinaryTurn), { synchronous: 1, total: 1 });
  assert.deepEqual(await switches(candidate, start), { synchronous: 0, total: 1 });
  for (const row of [ordinaryTurn, { ...ordinaryTurn, delta: { name: 'Combat' } },
    { ...start, previous: 2 }, { ...start, enabled: false }, { ...start, tab: 'chat' },
    { ...start, leave: true }, { round: 2, previous: 1, delta: { round: 2, turn: 0 } }]) {
    assert.deepEqual(await switches(candidate, row), { synchronous: 0, total: 0 });
  }
});

test('initiative notifications yield in order and preserve native arguments and receiver', () => {
  const schedule = [];
  const calls = [];
  let enabled = true;
  const chat = {
    _shouldShowNotifications: () => enabled,
    notify(message, options) { calls.push([this, message, options]); }
  };
  const register = new Function('Hooks', 'ui', 'setTimeout',
    callbackSource(candidate, 'Hooks.once("ready", () => {'));
  register({ once: (_name, fn) => fn() }, { chat }, (fn, delay) => {
    assert.equal(delay, 0);
    return schedule.push(fn);
  });
  const first = { getFlag: (scope, key) => scope === 'core' && key === 'initiativeRoll' };
  const second = { ...first };
  const third = { ...first };
  const normal = { getFlag: () => false };
  const options = { newMessage: true };
  const reminder = { newMessage: false };
  chat.notify(first, options);
  chat.notify(second, options);
  chat.notify(third, options);
  chat.notify(normal, options);
  chat.notify(first, reminder);
  enabled = false;
  chat.notify(third, options);
  assert.deepEqual(calls, [[chat, first, options], [chat, normal, options], [chat, first, reminder], [chat, third, options]]);
  enabled = true;
  schedule.shift()();
  assert.equal(calls.at(-1)[1], second);
  schedule.shift()();
  assert.equal(calls.at(-1)[1], third);
  assert(calls.every(call => call[0] === chat));
  assert.equal(calls.at(-1)[2], options);
  schedule.shift()();
  assert.equal(schedule.length, 0);
});
