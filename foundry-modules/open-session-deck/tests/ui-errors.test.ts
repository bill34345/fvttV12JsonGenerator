import { afterEach, expect, test } from 'bun:test';
import { runDeckUiAction } from '../src/ui-errors.ts';

const gameDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'game');
const uiDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ui');

afterEach(() => {
  if (gameDescriptor) Object.defineProperty(globalThis, 'game', gameDescriptor); else delete (globalThis as any).game;
  if (uiDescriptor) Object.defineProperty(globalThis, 'ui', uiDescriptor); else delete (globalThis as any).ui;
});

test('invokes immediately for popup gestures and reports synchronous or rejected failures', async () => {
  const errors: string[] = [];
  Object.assign(globalThis, {
    game: { i18n: { localize: (key: string) => key } },
    ui: { notifications: { error: (value: string) => errors.push(value) } },
  });
  const calls: string[] = [];
  runDeckUiAction(async () => { calls.push('popup'); throw new Error('blocked'); });
  expect(calls).toEqual(['popup']);
  await Promise.resolve();
  runDeckUiAction(() => { throw new Error('synchronous'); });
  expect(errors).toEqual([
    'OSD.Notifications.ActionFailed: Error: blocked',
    'OSD.Notifications.ActionFailed: Error: synchronous',
  ]);
});

test('a failed notification does not produce another unhandled rejection', async () => {
  Object.assign(globalThis, {
    game: { i18n: { localize: (key: string) => key } },
    ui: { notifications: { error: () => { throw new Error('notification unavailable'); } } },
  });
  runDeckUiAction(async () => { throw new Error('action unavailable'); });
  await Promise.resolve();
  await Promise.resolve();
});
