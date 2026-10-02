/** Small Foundry boundary helpers.  None of these functions assume a Node
 * runtime so the module bundle remains safe to load in the browser. */

export interface QueryContext {
  timeout?: number;
  user?: any;
}

export function isActiveGM(globals: any = globalThis): boolean {
  const user = globals?.game?.user;
  const activeGM = globals?.game?.users?.activeGM;
  return user?.isGM === true && user.active !== false && Boolean(activeGM)
    && (activeGM === user || (activeGM.id !== undefined && activeGM.id === user.id));
}

export function activeGM(globals: any = globalThis): any | undefined {
  return globals?.game?.users?.activeGM;
}

export function documentUuid(document: any): string | undefined {
  const uuid = document?.uuid;
  if (typeof uuid === 'string' && uuid.trim()) return uuid;
  const id = document?.id ?? document?._id;
  const documentName = document?.documentName ?? document?.constructor?.documentName;
  if (typeof id !== 'string' || !id.trim() || typeof documentName !== 'string') return undefined;
  return `${documentName}.${id}`;
}

export function actorUuid(actor: any): string | undefined {
  const uuid = documentUuid(actor);
  if (uuid) return uuid;
  const id = actor?.id ?? actor?._id;
  return typeof id === 'string' && id.trim() ? `Actor.${id}` : undefined;
}

export function itemUuid(item: any): string | undefined {
  return documentUuid(item);
}

export function activityUuid(activity: any): string | undefined {
  return documentUuid(activity) ?? (activity?.uuid || undefined);
}

export function collection(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value?.values === 'function') return [...value.values()];
  if (Array.isArray(value?.contents)) return [...value.contents];
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

export async function fromUuid(globals: any, uuid: string | undefined): Promise<any | undefined> {
  if (!uuid) return undefined;
  const resolver = globals?.foundry?.utils?.fromUuid ?? globals?.fromUuid;
  if (typeof resolver === 'function') {
    try { return await resolver.call(globals?.foundry?.utils, uuid); } catch { return undefined; }
  }
  const id = uuid.split('.').at(-1);
  if (!id) return undefined;
  if (uuid.startsWith('Actor.')) return globals?.game?.actors?.get?.(id);
  if (uuid.startsWith('Item.')) return globals?.game?.items?.get?.(id);
  return undefined;
}

export function moduleRecord(globals: any, id: string): any | undefined {
  return globals?.game?.modules?.get?.(id)
    ?? collection(globals?.game?.modules).find((entry) => entry?.id === id || entry?.name === id);
}

export function notification(globals: any, type: 'info' | 'warn' | 'error', message: string): void {
  const fn = globals?.ui?.notifications?.[type];
  if (typeof fn === 'function') fn.call(globals.ui.notifications, message);
}

export function randomId(globals: any = globalThis, prefix = 'wm'): string {
  const randomID = globals?.foundry?.utils?.randomID;
  if (typeof randomID === 'function') return `${prefix}-${randomID.call(globals.foundry.utils)}`;
  const crypto = globals?.crypto ?? globalThis.crypto;
  if (typeof crypto?.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getProperty(object: any, path: string): any {
  if (typeof object?.getFlag === 'function' && path.startsWith('flags.')) {
    const [, namespace, ...rest] = path.split('.');
    if (namespace && rest.length) return object.getFlag(namespace, rest.join('.'));
  }
  return path.split('.').reduce((value, key) => value?.[key], object);
}

export function setLocalProperty(object: any, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = object;
  for (const part of parts.slice(0, -1)) {
    if (!current[part] || typeof current[part] !== 'object') current[part] = {};
    current = current[part];
  }
  current[parts.at(-1)!] = value;
}

export function activeTurn(globals: any): { key?: string; combat?: any; round?: number; turn?: number } {
  const combat = globals?.game?.combat ?? globals?.game?.combats?.active;
  if (!combat || combat.active === false) return {};
  const current = combat.current ?? {};
  const round = Number(combat.round ?? current.round);
  const turn = Number(combat.turn ?? current.turn);
  if (!Number.isInteger(round) || !Number.isInteger(turn) || round < 0 || turn < 0) return { combat };
  const combatUuid = documentUuid(combat) ?? `Combat.${String(combat.id ?? 'active')}`;
  return { key: `${combatUuid}:${round}:${turn}`, combat, round, turn };
}

export function actorSize(actor: any): any {
  const size = actor?.system?.traits?.size ?? actor?.system?.traits?.size?.value;
  return typeof size === 'string' ? size.toLowerCase() : undefined;
}

export function targetActor(target: any): any | undefined {
  return target?.actor ?? target?.document?.actor ?? (target?.documentName === 'Actor' ? target : undefined);
}

export function targetToken(target: any): any | undefined {
  if (!target) return undefined;
  if (target?.documentName === 'Token' || target?.document?.documentName === 'Token') return target?.document ?? target;
  return target?.token ?? target?.document?.token;
}

export function itemActivity(item: any, activityId?: string): any | undefined {
  if (!item) return undefined;
  const activities = item.system?.activities;
  if (activityId && typeof activities?.get === 'function') return activities.get(activityId);
  if (activityId && activities && typeof activities === 'object') return activities[activityId];
  if (typeof activities?.values === 'function') return [...activities.values()][0];
  if (Array.isArray(activities)) return activities[0];
  if (activities && typeof activities === 'object') return Object.values(activities)[0];
  return undefined;
}

export function isOwnedBy(user: any, document: any): boolean {
  if (!user || !document) return false;
  try {
    if (typeof document.testUserPermission === 'function') return document.testUserPermission(user, 'OWNER');
  } catch { /* fall through to the explicit owner flag */ }
  // `isOwner` is evaluated for the local client and cannot authenticate the
  // user supplied by Foundry's CONFIG.queries context.  Accept it only when
  // there is no document permission API and the caller is the current user.
  const current = (globalThis as any).game?.user;
  return current === user && (document.isOwner === true || document.actor?.isOwner === true);
}

export function clone<T>(value: T): T {
  if (value === undefined) return value;
  try { return structuredClone(value); } catch {
    try { return JSON.parse(JSON.stringify(value)) as T; } catch { return value; }
  }
}
