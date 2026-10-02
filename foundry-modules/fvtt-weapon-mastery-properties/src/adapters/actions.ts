import { MODULE_ID } from '../constants.ts';
import {
  activityUuid,
  actorUuid,
  collection,
  documentUuid,
  itemUuid,
  moduleRecord,
  targetActor,
  targetToken,
} from './foundry.ts';

export interface ActionContext {
  sourceActor: any;
  sourceToken: any;
  targetActor: any;
  targetToken: any;
  activity?: any;
  item?: any;
  globals?: any;
}

export interface ActionResult<T = unknown> {
  ok: boolean;
  status: 'applied' | 'selected' | 'success' | 'failure' | 'cancelled' | 'immune' | 'invalid' | 'unavailable';
  value?: T;
  reason?: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface PushRuleParams {
  distanceFeet?: number;
  maxDistanceFeet?: number;
}

export interface PushActionContext extends ActionContext {
  rule?: PushRuleParams;
  /** A supplied point is already an explicit user choice and is validated without fallback selection. */
  destination?: Point;
  updateOptions?: Record<string, unknown>;
}

export interface PushValidation {
  destination: Point;
  distanceFeet: number;
}

export interface CleaveActionContext extends ActionContext {
  /** Defaults to the target pair supplied by ActionContext. */
  primaryTargetActor?: any;
  primaryTargetToken?: any;
  candidates?: readonly any[];
  selected?: any;
  distanceFeet?: number;
  reachFeet?: number;
}

export interface CleaveSelection {
  target: any;
  actor: any;
  token: any;
  distanceFromPrimaryFeet: number;
  distanceFromSourceFeet: number;
}

export interface ToppleActionContext extends ActionContext {
  dc: number;
  dialog?: Record<string, unknown>;
  message?: Record<string, unknown>;
}

export interface ToppleResult {
  total: number;
  dc: number;
  roll: any;
  condition: 'prone';
}

export interface CriticalBleedingParams {
  formula: string;
  mode: 'damage' | 'hpLoss';
  damageType?: string;
  endOnHealing?: boolean;
}

export interface CriticalBleedingActionContext extends ActionContext {
  rule: CriticalBleedingParams;
}

const SIZE_SQUARES: Readonly<Record<string, number>> = {
  tiny: 1,
  sm: 1,
  small: 1,
  med: 1,
  medium: 1,
  lg: 2,
  large: 2,
  huge: 3,
  grg: 4,
  gargantuan: 4,
};

function globalsFor(context: ActionContext): any {
  return context.globals ?? globalThis;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validPoint(value: unknown): value is Point {
  return Boolean(value && typeof value === 'object'
    && finite((value as Point).x) && finite((value as Point).y));
}

function normalizedSize(actor: any): string {
  const raw = actor?.system?.traits?.size;
  const value = typeof raw === 'string' ? raw : raw?.value;
  return typeof value === 'string' ? value.toLowerCase() : 'medium';
}

function footprintSquares(actor: any): number {
  return SIZE_SQUARES[normalizedSize(actor)] ?? SIZE_SQUARES.medium!;
}

function canvasFor(globals: any): any {
  return globals?.canvas;
}

function gridFor(globals: any): any {
  const canvas = canvasFor(globals);
  return canvas?.grid;
}

function gridSize(globals: any): number | null {
  const canvas = canvasFor(globals);
  const value = canvas?.dimensions?.size ?? gridFor(globals)?.size;
  return finite(value) && value > 0 ? value : null;
}

function tokenDocument(token: any): any | undefined {
  return token?.document ?? (token?.documentName === 'Token' ? token : undefined);
}

function tokenPosition(token: any): Point | null {
  const document = tokenDocument(token);
  const x = document?.x ?? token?.x;
  const y = document?.y ?? token?.y;
  return finite(x) && finite(y) ? { x, y } : null;
}

function tokenElevation(token: any): number {
  const value = tokenDocument(token)?.elevation ?? token?.elevation;
  return finite(value) ? value : 0;
}

function tokenCells(token: any, actor: any, globals: any): Point[] | null {
  const origin = tokenPosition(token);
  const size = gridSize(globals);
  if (!origin || !size) return null;
  const squares = footprintSquares(actor);
  const cells: Point[] = [];
  for (let x = 0; x < squares; x += 1) {
    for (let y = 0; y < squares; y += 1) {
      cells.push({ x: origin.x + (x + 0.5) * size, y: origin.y + (y + 0.5) * size });
    }
  }
  return cells;
}

function tokenCenter(token: any, actor: any, globals: any): Point | null {
  const cells = tokenCells(token, actor, globals);
  if (!cells?.length) return null;
  return {
    x: cells.reduce((sum, point) => sum + point.x, 0) / cells.length,
    y: cells.reduce((sum, point) => sum + point.y, 0) / cells.length,
  };
}

function measurePoints(globals: any, from: Point, to: Point): number | null {
  const grid = gridFor(globals);
  if (typeof grid?.measurePath !== 'function') return null;
  try {
    const measured = grid.measurePath.call(grid, [from, to]);
    return finite(measured?.distance) && measured.distance >= 0 ? measured.distance : null;
  } catch {
    return null;
  }
}

function distanceBetween(globals: any, leftToken: any, leftActor: any, rightToken: any, rightActor: any): number | null {
  const left = tokenCells(leftToken, leftActor, globals);
  const right = tokenCells(rightToken, rightActor, globals);
  if (!left?.length || !right?.length) return null;
  const horizontal: number[] = [];
  for (const from of left) {
    for (const to of right) {
      const distance = measurePoints(globals, from, to);
      if (distance !== null) horizontal.push(distance);
    }
  }
  if (!horizontal.length) return null;
  const elevation = Math.abs(tokenElevation(leftToken) - tokenElevation(rightToken));
  return Math.hypot(Math.min(...horizontal), elevation);
}

function collisionBlocked(globals: any, token: any, from: Point, to: Point): boolean | null {
  if (typeof token?.checkCollision === 'function') {
    try {
      const result = token.checkCollision(to, { type: 'move', mode: 'any' });
      return Boolean(result);
    } catch {
      return null;
    }
  }
  const backend = globals?.CONFIG?.Canvas?.polygonBackends?.move
    ?? globals?.CONFIG?.canvas?.polygonBackends?.move;
  if (typeof backend?.testCollision !== 'function') return null;
  try {
    return Boolean(backend.testCollision(from, to, { type: 'move', mode: 'any' }));
  } catch {
    return null;
  }
}

function straightAway(from: Point, current: Point, destination: Point): boolean {
  const awayX = current.x - from.x;
  const awayY = current.y - from.y;
  const moveX = destination.x - current.x;
  const moveY = destination.y - current.y;
  const moveLength = Math.hypot(moveX, moveY);
  if (moveLength < 1e-6) return true;
  const awayLength = Math.hypot(awayX, awayY);
  if (awayLength < 1e-6) return false;
  const cross = Math.abs(awayX * moveY - awayY * moveX);
  const dot = awayX * moveX + awayY * moveY;
  return cross <= Math.max(1, awayLength * moveLength) * 1e-6 && dot >= -1e-6;
}

function withinScene(globals: any, destination: Point, actor: any): boolean {
  const rect = canvasFor(globals)?.dimensions?.sceneRect;
  const size = gridSize(globals);
  if (!rect || !size) return true;
  const squares = footprintSquares(actor);
  return destination.x >= rect.x && destination.y >= rect.y
    && destination.x + squares * size <= rect.x + rect.width
    && destination.y + squares * size <= rect.y + rect.height;
}

function destinationFromDialogResult(result: unknown): Point | undefined {
  if (validPoint(result)) return { x: result.x, y: result.y };
  if (result && typeof result === 'object' && validPoint((result as any).destination)) {
    return { x: (result as any).destination.x, y: (result as any).destination.y };
  }
  return undefined;
}

async function pushDialog(context: PushActionContext, maxDistance: number): Promise<ActionResult<Point>> {
  const globals = globalsFor(context);
  const DialogV2 = globals?.foundry?.applications?.api?.DialogV2;
  if (typeof DialogV2?.wait !== 'function') return { ok: false, status: 'unavailable', reason: 'DialogV2.wait unavailable' };
  const result = await DialogV2.wait({
    window: { title: 'Push destination' },
    content: `<p>Choose a destination straight away from the attacker, within 0–${maxDistance} feet.</p><label>X <input name="x" type="number"></label><label>Y <input name="y" type="number"></label>`,
    buttons: [
      { action: 'confirm', label: 'Apply', callback: (_event: unknown, _button: unknown, dialog: any) => {
        const element = dialog?.element ?? dialog?.form;
        const x = Number(element?.querySelector?.('[name="x"]')?.value);
        const y = Number(element?.querySelector?.('[name="y"]')?.value);
        return validPoint({ x, y }) ? { x, y } : undefined;
      } },
      { action: 'cancel', label: 'Cancel', callback: () => undefined },
    ],
  });
  const point = destinationFromDialogResult(result);
  return point ? { ok: true, status: 'selected', value: point } : { ok: false, status: 'cancelled', reason: 'Push destination selection cancelled.' };
}

/** Validate a Push destination without mutating the TokenDocument. */
export async function validatePushDestination(
  context: PushActionContext,
  destination: Point,
): Promise<ActionResult<PushValidation>> {
  const globals = globalsFor(context);
  const sourceCenter = tokenCenter(context.sourceToken, context.sourceActor, globals);
  const currentCenter = tokenCenter(context.targetToken, context.targetActor, globals);
  const destinationOrigin = tokenPosition(context.targetToken);
  if (!sourceCenter || !currentCenter || !destinationOrigin || !validPoint(destination)) {
    return { ok: false, status: 'invalid', reason: 'Source/target token geometry is unavailable.' };
  }
  const maxDistance = context.rule?.maxDistanceFeet ?? context.rule?.distanceFeet ?? 10;
  if (!finite(maxDistance) || maxDistance < 0) return { ok: false, status: 'invalid', reason: 'Push distance is invalid.' };
  const size = gridSize(globals);
  if (!size) return { ok: false, status: 'unavailable', reason: 'Scene grid is unavailable.' };
  const destinationCenter = {
    x: destination.x + footprintSquares(context.targetActor) * size / 2,
    y: destination.y + footprintSquares(context.targetActor) * size / 2,
  };
  if (!straightAway(sourceCenter, currentCenter, destinationCenter)) {
    return { ok: false, status: 'invalid', reason: 'Push destination is not straight away from the attacker.' };
  }
  const distanceFeet = measurePoints(globals, currentCenter, destinationCenter);
  if (distanceFeet === null) return { ok: false, status: 'unavailable', reason: 'Scene grid measurement is unavailable.' };
  if (distanceFeet < 0 || distanceFeet > maxDistance + 1e-6) {
    return { ok: false, status: 'invalid', reason: 'Push destination exceeds the configured distance.' };
  }
  if (!withinScene(globals, destination, context.targetActor)) return { ok: false, status: 'invalid', reason: 'Push destination is outside the scene.' };
  const blocked = collisionBlocked(globals, context.targetToken, currentCenter, destinationCenter);
  if (blocked === null) return { ok: false, status: 'unavailable', reason: 'Public movement collision API is unavailable.' };
  if (blocked) return { ok: false, status: 'invalid', reason: 'Push destination is blocked.' };
  return { ok: true, status: 'selected', value: { destination: { x: destination.x, y: destination.y }, distanceFeet } };
}

/** Prompt, validate, and apply a Push movement to the real TokenDocument. */
export async function applyPushAction(context: PushActionContext): Promise<ActionResult<PushValidation>> {
  const selected = context.destination
    ? { ok: true, status: 'selected' as const, value: context.destination }
    : await pushDialog(context, context.rule?.maxDistanceFeet ?? context.rule?.distanceFeet ?? 10);
  if (!selected.ok || !selected.value) return { ok: false, status: selected.status, reason: selected.reason };
  const validated = await validatePushDestination(context, selected.value);
  if (!validated.ok || !validated.value) return validated;
  const document = tokenDocument(context.targetToken);
  if (typeof document?.update !== 'function') return { ok: false, status: 'unavailable', reason: 'TokenDocument.update unavailable.' };
  await document.update({ x: validated.value.destination.x, y: validated.value.destination.y }, context.updateOptions);
  return { ok: true, status: 'applied', value: validated.value };
}

function dialogCandidates(globals: any, candidates: readonly any[], title: string): Promise<any | undefined> {
  const DialogV2 = globals?.foundry?.applications?.api?.DialogV2;
  if (typeof DialogV2?.wait !== 'function') return Promise.resolve(undefined);
  const buttons = candidates.map((candidate, index) => ({
    action: String(index),
    label: String(targetActor(candidate)?.name ?? candidate?.name ?? candidate?.id ?? `Target ${index + 1}`),
    callback: () => candidate,
  }));
  buttons.push({ action: 'cancel', label: 'Cancel', callback: () => undefined });
  return DialogV2.wait({
    window: { title },
    content: `<p>${candidates.map((candidate, index) => `${index + 1}. ${escapeHtml(String(targetActor(candidate)?.name ?? candidate?.name ?? candidate?.id ?? 'Target'))}`).join('<br>')}</p>`,
    buttons,
  }).then((result: unknown) => {
    if (candidates.includes(result)) return result;
    if (typeof result === 'number' && Number.isInteger(result)) return candidates[result];
    if (typeof result === 'string' && /^\d+$/.test(result)) return candidates[Number(result)];
    if (result && typeof result === 'object' && candidates.includes((result as any).target)) return (result as any).target;
    return undefined;
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}

function sameDocument(left: any, right: any): boolean {
  const leftUuid = documentUuid(left) ?? actorUuid(targetActor(left));
  const rightUuid = documentUuid(right) ?? actorUuid(targetActor(right));
  return Boolean(leftUuid && rightUuid && leftUuid === rightUuid);
}

function validCleaveCandidate(context: CleaveActionContext, candidate: any): CleaveSelection | null {
  const globals = globalsFor(context);
  const primaryActor = context.primaryTargetActor ?? context.targetActor;
  const primaryToken = context.primaryTargetToken ?? context.targetToken;
  const actor = targetActor(candidate);
  const token = targetToken(candidate);
  if (!actor || !token || sameDocument(actor, context.sourceActor) || sameDocument(actor, primaryActor)) return null;
  const distanceFromPrimaryFeet = distanceBetween(globals, primaryToken, primaryActor, token, actor);
  const distanceFromSourceFeet = distanceBetween(globals, context.sourceToken, context.sourceActor, token, actor);
  const maxDistance = context.distanceFeet ?? 5;
  const reach = context.reachFeet;
  if (distanceFromPrimaryFeet === null || distanceFromSourceFeet === null || !finite(reach) || reach < 0) return null;
  if (distanceFromPrimaryFeet > maxDistance + 1e-6 || distanceFromSourceFeet > reach + 1e-6) return null;
  return { target: candidate, actor, token, distanceFromPrimaryFeet, distanceFromSourceFeet };
}

/** Find a legal Cleave secondary creature and require an explicit choice. */
export async function selectCleaveSecondary(context: CleaveActionContext): Promise<ActionResult<CleaveSelection>> {
  const globals = globalsFor(context);
  const rawCandidates = context.candidates ?? collection(globals?.game?.user?.targets ?? globals?.game?.targets);
  const legal = rawCandidates.map((candidate) => validCleaveCandidate(context, candidate)).filter((entry): entry is CleaveSelection => Boolean(entry));
  if (!legal.length) return { ok: false, status: 'invalid', reason: 'No legal Cleave secondary creature is available.' };
  if (context.selected !== undefined) {
    const selected = legal.find((entry) => sameDocument(entry.target, context.selected) || sameDocument(entry.actor, context.selected));
    return selected
      ? { ok: true, status: 'selected', value: selected }
      : { ok: false, status: 'invalid', reason: 'The requested Cleave target is not legal.' };
  }
  const chosen = await dialogCandidates(globals, legal.map((entry) => entry.target), 'Cleave target');
  if (!chosen) return { ok: false, status: 'cancelled', reason: 'Cleave target selection cancelled.' };
  const selected = legal.find((entry) => sameDocument(entry.target, chosen));
  return selected ? { ok: true, status: 'selected', value: selected } : { ok: false, status: 'invalid', reason: 'Cleave dialog returned an unknown target.' };
}

function conditionImmune(actor: any, condition: string): boolean {
  const value = actor?.system?.traits?.ci?.value;
  if (value instanceof Set) return value.has(condition);
  if (Array.isArray(value)) return value.includes(condition);
  if (typeof value === 'string') return value === condition;
  return false;
}

/** Roll the native dnd5e Constitution save and apply native Prone on failure. */
export async function resolveToppleAction(context: ToppleActionContext): Promise<ActionResult<ToppleResult>> {
  const target = context.targetActor;
  if (!target || typeof target.rollSavingThrow !== 'function') return { ok: false, status: 'unavailable', reason: 'Actor.rollSavingThrow unavailable.' };
  if (!finite(context.dc)) return { ok: false, status: 'invalid', reason: 'Topple DC is invalid.' };
  if (conditionImmune(target, 'prone')) return { ok: false, status: 'immune', reason: 'Target is immune to Prone.' };
  const rolls = await target.rollSavingThrow({ ability: 'con', target: context.dc }, context.dialog ?? {}, context.message ?? {});
  const roll = Array.isArray(rolls) ? rolls[0] : rolls;
  if (!roll || !finite(roll.total)) return { ok: false, status: 'cancelled', reason: 'Saving throw was cancelled.' };
  const result: ToppleResult = { total: roll.total, dc: context.dc, roll, condition: 'prone' };
  if (roll.total >= context.dc) return { ok: true, status: 'success', value: result };
  if (typeof target.toggleStatusEffect !== 'function') return { ok: false, status: 'unavailable', reason: 'Actor.toggleStatusEffect unavailable.' };
  await target.toggleStatusEffect('prone', { active: true });
  return { ok: true, status: 'failure', value: result };
}

/** Apply critical bleeding through the public custom-conditions API. */
export async function applyCriticalBleedingAction(
  context: CriticalBleedingActionContext,
): Promise<ActionResult<{ result: unknown; params: Record<string, string | boolean> }>> {
  const target = context.targetActor;
  const rule = context.rule;
  if (!target || !rule || typeof rule.formula !== 'string' || !rule.formula.trim()
    || (rule.mode !== 'damage' && rule.mode !== 'hpLoss')
    || (rule.mode === 'damage' && (typeof rule.damageType !== 'string' || !rule.damageType.trim()))) {
    return { ok: false, status: 'invalid', reason: 'Critical bleeding parameters are invalid.' };
  }
  const source = actorUuid(context.sourceActor);
  const origin = activityUuid(context.activity) ?? itemUuid(context.item) ?? source;
  if (!source || !origin) return { ok: false, status: 'invalid', reason: 'Critical bleeding source/origin is unavailable.' };
  const api = moduleRecord(globalsFor(context), 'fvtt-custom-conditions')?.api;
  if (typeof api?.apply !== 'function') return { ok: false, status: 'unavailable', reason: 'Custom Conditions apply API unavailable.' };
  const params: Record<string, string | boolean> = {
    formula: rule.formula,
    mode: rule.mode,
    timing: 'turnEnd',
    stacking: 'highest',
    endOnHealing: rule.endOnHealing !== false,
    ...(rule.damageType ? { damageType: rule.damageType } : {}),
  };
  const result = await api.apply(target, 'bleeding', params, { source, origin });
  return { ok: true, status: 'applied', value: { result, params } };
}
