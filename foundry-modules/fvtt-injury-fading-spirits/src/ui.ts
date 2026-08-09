import { MAX_INJURY_STACKS, MODULE_ID } from './constants.ts';
import { beginRitual, cancelPendingRitual, rapidResurrectionDc, resurrectionDc, resurrectionTransactionId, resolveAttempt } from './fading.ts';
import { setInjuryStacks } from './injury.ts';
import { isActiveGmWriter, readActorState, writeActorState } from './persistence.ts';
import { projectInjuryStatus } from './projection.ts';
import type { RitualContributor } from './state.ts';

interface FormValues { [key: string]: FormDataEntryValue }

const ritualStartLocks = new Set<string>();
const resolutionLocks = new Set<string>();
const resolutionClaimQueues = new Map<string, Promise<void>>();

export async function openActorDashboard(actor: any): Promise<void> {
  if (!actor) return notify('warn', 'IFS.Errors.ActorRequired');
  const state = readActorState(actor);
  const html = `<div class="ifs-dashboard">
    <p><strong>${escapeHtml(actor.name)}</strong></p>
    <p>${label('IFS.Status.Injury')}: <strong>${state.injury.stacks}</strong></p>
    <p>${label('IFS.Fading.SuccessfulReturns')}: ${state.fadingSpirits.successfulReturns}; DC +${state.fadingSpirits.permanentDcPenalty}</p>
    <p>${label('IFS.Fading.ConventionalLock')}: ${state.fadingSpirits.conventionalResurrectionLocked ? '✓' : '—'}; ${label('IFS.Fading.FinalUsed')}: ${state.fadingSpirits.finalChanceUsed ? '✓' : '—'}</p>
  </div>`;
  const action = await dialogWait({
    window: { title: label('IFS.Title') },
    content: html,
    buttons: [
      { action: 'injury', label: 'IFS.Actions.SetInjury', callback: () => 'injury' },
      { action: 'resurrection', label: 'IFS.Actions.Resurrection', callback: () => 'resurrection' },
      { action: 'close', label: 'IFS.Actions.Close', callback: () => 'close' },
    ],
  });
  if (action === 'injury') await openSetInjuryDialog(actor);
  else if (action === 'resurrection') await openResurrectionWizard(actor);
}

export async function openSetInjuryDialog(actor: any): Promise<void> {
  if (!isActiveGmWriter()) return notify('warn', 'IFS.Errors.ActiveGmOnly');
  const state = readActorState(actor);
  const value = await dialogWait({
    window: { title: label('IFS.Actions.SetInjury') },
    content: `<form><div class="form-group"><label>${label('IFS.Status.Injury')}</label><input type="number" name="stacks" min="0" max="${MAX_INJURY_STACKS}" step="1" value="${state.injury.stacks}"></div></form>`,
    buttons: [
      { action: 'save', label: 'IFS.Actions.Save', callback: (_event: unknown, button: any) => formValues(button?.form) },
      { action: 'cancel', label: 'IFS.Actions.Cancel', callback: () => null },
    ],
  }) as FormValues | null;
  if (!value) return;
  const stacks = Number(value.stacks);
  if (!Number.isInteger(stacks) || stacks < 0 || stacks > MAX_INJURY_STACKS) return notify('error', 'IFS.Errors.InvalidStacks');
  state.injury = setInjuryStacks(state.injury, stacks);
  await writeActorState(actor, state, `manual-injury:${actor.uuid}:${Date.now()}`);
  await projectInjuryStatus(actor, stacks);
}

export async function openResurrectionWizard(actor: any, forcedMode?: 'final'): Promise<void> {
  if (!isActiveGmWriter()) return notify('warn', 'IFS.Errors.ActiveGmOnly');
  const state = readActorState(actor);
  const pending = state.fadingSpirits.pendingRitual;
  if (pending) return openResolveRitualDialog(actor, pending.id);
  if (state.fadingSpirits.resurrectionConsumedForCurrentDeath) {
    return notify('warn', 'IFS.Errors.ResurrectionAlreadyConsumed');
  }

  const contributors = [0, 1, 2].map((index) => contributorFields(index)).join('');
  const modeOptions = forcedMode
    ? modeOption('final', 'IFS.Fading.Modes.Final', true)
    : [
      modeOption('normal', 'IFS.Fading.Modes.Normal'),
      modeOption('rapid', 'IFS.Fading.Modes.Rapid'),
      modeOption('miracle', 'IFS.Fading.Modes.Miracle'),
    ].join('');
  const values = await dialogWait({
    window: { title: `${label('IFS.Actions.Resurrection')}: ${actor.name}` },
    position: { width: 720, height: 'auto' },
    content: `<form class="ifs-form"><div class="form-group"><label>${label('IFS.Fading.Mode')}</label><select name="mode">${modeOptions}</select></div>
      <div class="form-group"><label>${label('IFS.Fading.RapidCasterModifier')}</label><input type="number" name="abilityMod" value="0"></div>
      <fieldset><legend>${label('IFS.Fading.Contributors')}</legend>${contributors}</fieldset>
      <label><input type="checkbox" name="soulWilling" checked> ${label('IFS.Fading.SoulWilling')}</label></form>`,
    buttons: [
      { action: 'begin', label: 'IFS.Actions.Begin', callback: (_event: unknown, button: any) => formValues(button?.form) },
      { action: 'cancel', label: 'IFS.Actions.Cancel', callback: () => null },
    ],
  }) as FormValues | null;
  if (!values) return;
  const mode = String(values.mode);
  const soulWilling = values.soulWilling === 'on';
  if (mode === 'rapid') return resolveRapid(actor, Number(values.abilityMod), soulWilling);
  if (mode === 'miracle') {
    if (state.fadingSpirits.conventionalResurrectionLocked) return openResurrectionWizard(actor, 'final');
    return resolveMiracle(actor, soulWilling);
  }
  if (mode !== 'normal' && mode !== 'final') return notify('error', 'IFS.Errors.InvalidMode');
  try {
    const parsed = await parseContributors(values);
    await createRitualRequests(actor, mode, parsed);
  } catch (error) {
    notifyException(error);
  }
}

export async function openResolveRitualDialog(actor: any, ritualId: string): Promise<void> {
  if (!isActiveGmWriter()) return notify('warn', 'IFS.Errors.ActiveGmOnly');
  const state = readActorState(actor);
  const pending = state.fadingSpirits.pendingRitual;
  if (!pending || pending.id !== ritualId) return notify('warn', 'IFS.Errors.RitualMissing');
  const rows = pending.contributors.map((entry, index) => {
    const observed = observedRequestResult(entry.requestMessageId);
    const suggested = observed.total === null ? '' : observed.total >= entry.dc ? 'success' : 'failure';
    return `<div class="ifs-contribution"><strong>${escapeHtml(observed.actorName ?? entry.actorUuid)}</strong> — ${escapeHtml(entry.check)} DC ${entry.dc}
      <span>${observed.total === null ? label('IFS.Fading.NoLinkedRoll') : `${label('IFS.Fading.LinkedTotal')} ${observed.total}`}</span>
      <select name="outcome${index}"><option value="success" ${suggested === 'success' ? 'selected' : ''}>${label('IFS.Fading.ConfirmSuccess')}</option><option value="failure" ${suggested === 'failure' ? 'selected' : ''}>${label('IFS.Fading.ConfirmFailure')}</option></select></div>`;
  }).join('');
  const resolution = await dialogWait({
    window: { title: `${label('IFS.Actions.Resolve')}: ${actor.name}` },
    position: { width: 680, height: 'auto' },
    content: `<form class="ifs-form">${rows || `<p>${label('IFS.Fading.NoContributors')}</p>`}<label><input type="checkbox" name="soulWilling" checked> ${label('IFS.Fading.SoulWilling')}</label></form>`,
    buttons: [
      { action: 'resolve', label: 'IFS.Actions.Resolve', callback: (_event: unknown, button: any) => formValues(button?.form) },
      { action: 'cancelRitual', label: 'IFS.Actions.CancelRitual', callback: () => 'cancelRitual' },
      { action: 'close', label: 'IFS.Actions.Close', callback: () => null },
    ],
  });
  if (resolution === 'cancelRitual') {
    const latest = readActorState(actor);
    const latestPending = latest.fadingSpirits.pendingRitual;
    if (!latestPending || latestPending.id !== pending.id) {
      return notify('warn', 'IFS.Errors.RitualMissing');
    }
    if (latestPending.resolutionStartedBy && resolutionOwnerIsActive(latestPending.resolutionStartedBy)) {
      return notify('warn', 'IFS.Errors.ResolutionInProgress');
    }
    latest.fadingSpirits = cancelPendingRitual(latest.fadingSpirits, pending.id, Date.now(), game.user.id);
    await writeActorState(actor, latest, `${pending.id}:cancel-write`);
    await createAuditSummary(actor, pending.mode, 0, 0, 0, 'cancelled');
    return;
  }
  const values = resolution as FormValues | null;
  if (!values) return;
  const resolutionKey = `${actor.uuid}:${pending.id}`;
  if (resolutionLocks.has(resolutionKey)) return notify('warn', 'IFS.Errors.ResolutionInProgress');
  resolutionLocks.add(resolutionKey);
  let claimToken: string | null = null;
  try {
  const stateForResolution = await withResolutionClaimQueue(`${actor.uuid}:${pending.id}`, async () => {
    const claimState = readActorState(actor);
    const claimPending = claimState.fadingSpirits.pendingRitual;
    if (!claimPending || claimPending.id !== pending.id) return null;
    if (claimPending.resolutionStartedBy && resolutionOwnerIsActive(claimPending.resolutionStartedBy)) return null;
    claimToken = resolutionLockToken();
    if (!await acquireResolutionDocumentLock(actor, pending.id, pending.mode, claimToken)) return null;
    claimPending.resolutionStartedBy = game.user.id;
    claimPending.resolutionStartedAt = Date.now();
    claimPending.resolutionToken = claimToken;
    claimState.fadingSpirits.pendingRitual = claimPending;
    await writeActorState(actor, claimState, `${pending.id}:resolution-claim`);
    const reread = readActorState(actor);
    const claimedPending = reread.fadingSpirits.pendingRitual;
    if (!isActiveGmWriter() || !claimedPending || claimedPending.id !== pending.id
      || claimedPending.resolutionStartedBy !== game.user.id || claimedPending.resolutionToken !== claimToken) return null;
    return reread;
  });
  if (!stateForResolution) {
    resolutionLocks.delete(resolutionKey);
    return notify('warn', 'IFS.Errors.ResolutionInProgress');
  }
  let successes = 0;
  for (let index = 0; index < pending.contributors.length; index += 1) if (values[`outcome${index}`] === 'success') successes += 1;
  const failures = pending.contributors.length - successes;
  const dc = resurrectionDc(stateForResolution.fadingSpirits, successes, failures);
  const roll = await blindRoll('1d20', {}, `Fading Spirits final check — DC ${dc}`);
  const beforeResolve = readActorState(actor);
  if (!isActiveGmWriter() || !beforeResolve.fadingSpirits.pendingRitual
    || beforeResolve.fadingSpirits.pendingRitual.id !== pending.id
    || beforeResolve.fadingSpirits.pendingRitual.resolutionStartedBy !== game.user.id
    || beforeResolve.fadingSpirits.pendingRitual.resolutionToken !== claimToken) {
    resolutionLocks.delete(resolutionKey);
    return notify('warn', 'IFS.Errors.ActiveGmOnly');
  }
  const resolved = resolveAttempt(beforeResolve.fadingSpirits, {
    id: pending.id, mode: pending.mode, at: Date.now(), gmId: game.user.id, dc,
    contributionSuccesses: successes, contributionFailures: failures,
    dieSucceeded: Number(roll.total) >= dc, soulWilling: values.soulWilling === 'on',
  });
  beforeResolve.fadingSpirits = resolved.state;
  if (resolved.returned) beforeResolve.injury.suppressNextRecovery = { transactionId: pending.id, reason: 'fading-spirits-success' };
  await writeActorState(actor, beforeResolve, `${pending.id}:resolution-write`);
  await createAuditSummary(actor, pending.mode, dc, successes, failures, resolved.result);
  } finally {
    if (claimToken) await releaseRitualResolution(actor, pending.id, claimToken);
    resolutionLocks.delete(resolutionKey);
  }
}

export function activateChatCard(message: any, html: any): void {
  if (!game.user?.isGM || !html?.querySelectorAll) return;
  for (const button of html.querySelectorAll('[data-ifs-action="resolve"]')) {
    button.addEventListener('click', () => {
      const actor = fromUuidSync(button.dataset.actorUuid);
      if (actor) void openResolveRitualDialog(actor, button.dataset.ritualId);
    });
  }
}

/** Internal fixture hooks; not part of the public module API. */
export const __testing = Object.freeze({
  resolutionLockDocumentId,
  acquireResolutionDocumentLock,
  releaseResolutionDocumentLock,
  releaseRitualResolution,
});

async function createRitualRequests(actor: any, mode: 'normal' | 'final', contributors: RitualContributor[]): Promise<void> {
  const lockKey = `${actor.uuid}:begin`;
  if (ritualStartLocks.has(lockKey)) return notify('warn', 'IFS.Errors.ResolutionInProgress');
  ritualStartLocks.add(lockKey);
  try {
    const state = readActorState(actor);
    const id = stableAttemptId(actor, state, mode);
    state.fadingSpirits = beginRitual(state.fadingSpirits, { id, mode, contributors, at: Date.now(), gmId: game.user.id });
    await writeActorState(actor, state, `${id}:begin-write`);
    for (const contributor of state.fadingSpirits.pendingRitual!.contributors) {
      const request = await createSkillRequest(actor, contributor);
      contributor.requestMessageId = request.id;
    }
    await writeActorState(actor, state, `${id}:requests-write`);
    await ChatMessage.create({
      content: `<div class="ifs-card"><p><strong>${escapeHtml(actor.name)}</strong>: ${label('IFS.Fading.RitualAwaiting')}</p><button type="button" data-ifs-action="resolve" data-actor-uuid="${escapeAttribute(actor.uuid)}" data-ritual-id="${escapeAttribute(id)}">${label('IFS.Actions.Resolve')}</button></div>`,
      whisper: gmRecipients(),
      speaker: ChatMessage.getSpeaker({ actor }),
      flags: { [MODULE_ID]: { card: 'ritual', actorUuid: actor.uuid, ritualId: id } },
    });
  } catch (error) {
    notifyException(error);
  } finally {
    ritualStartLocks.delete(lockKey);
  }
}

async function createSkillRequest(deadActor: any, contributor: RitualContributor): Promise<any> {
  const advantage = contributor.advantageMode === 'advantage';
  const disadvantage = contributor.advantageMode === 'disadvantage';
  return ChatMessage.create({
    flavor: `${deadActor.name}: ${label('IFS.Fading.ContributionFlavor')} — ${contributor.check} DC ${contributor.dc}`,
    speaker: ChatMessage.getSpeaker({ actor: deadActor, alias: deadActor.name }),
    system: {
      button: { icon: 'fa-solid fa-dice-d20', label: 'DND5E.SkillRoll' },
      data: {
        skill: contributor.check,
        ...(contributor.ability ? { ability: contributor.ability } : {}),
        target: contributor.dc,
        rolls: [{ options: { advantage, disadvantage } }],
      },
      handler: 'skill',
      targets: [{ actor: contributor.actorUuid }],
    },
    type: 'request',
    flags: { [MODULE_ID]: { contributionRequest: true, deadActorUuid: deadActor.uuid } },
  });
}

async function resolveRapid(actor: any, modifier: number, soulWilling: boolean): Promise<void> {
  if (!Number.isFinite(modifier)) return notify('error', 'IFS.Errors.InvalidModifier');
  const state = readActorState(actor);
  const id = stableAttemptId(actor, state, 'rapid');
  const lockKey = `${actor.uuid}:${id}`;
  if (resolutionLocks.has(lockKey)) return notify('warn', 'IFS.Errors.ResolutionInProgress');
  resolutionLocks.add(lockKey);
  let resolutionToken: string | null = null;
  try {
    const claimed = await claimInstantResolution(actor, id, 'rapid');
    if (!claimed) return;
    resolutionToken = claimed.fadingSpirits.resolutionInProgress?.token ?? null;
    if (!resolutionToken) return notify('warn', 'IFS.Errors.ResolutionInProgress');
    const dc = rapidResurrectionDc(claimed.fadingSpirits);
  const roll = await blindRoll('1d20 + @mod', { mod: modifier }, `Rapid resurrection — DC ${dc}`);
  const beforeResolve = readActorState(actor);
  const inFlight = beforeResolve.fadingSpirits.resolutionInProgress;
  if (!isActiveGmWriter() || stableAttemptId(actor, beforeResolve, 'rapid') !== id
    || !inFlight || inFlight.id !== id || inFlight.mode !== 'rapid' || inFlight.startedBy !== game.user.id
    || inFlight.token !== resolutionToken) {
    return notify('warn', 'IFS.Errors.ActiveGmOnly');
  }
  const resolved = resolveAttempt(beforeResolve.fadingSpirits, {
    id, mode: 'rapid', at: Date.now(), gmId: game.user.id, dc,
    dieSucceeded: Number(roll.total) >= dc, soulWilling,
  });
  beforeResolve.fadingSpirits = resolved.state;
  if (resolved.returned) beforeResolve.injury.suppressNextRecovery = { transactionId: id, reason: 'rapid-resurrection-success' };
  await writeActorState(actor, beforeResolve, `${id}:write`);
  await createAuditSummary(actor, 'rapid', dc, 0, 0, resolved.result);
  } catch (error) {
    notifyException(error);
  } finally {
    if (resolutionToken) await releaseInstantResolution(actor, id, resolutionToken);
    resolutionLocks.delete(lockKey);
  }
}

async function resolveMiracle(actor: any, soulWilling: boolean): Promise<void> {
  const state = readActorState(actor);
  const id = stableAttemptId(actor, state, 'miracle');
  const lockKey = `${actor.uuid}:${id}`;
  if (resolutionLocks.has(lockKey)) return notify('warn', 'IFS.Errors.ResolutionInProgress');
  resolutionLocks.add(lockKey);
  let resolutionToken: string | null = null;
  try {
    const claimed = await claimInstantResolution(actor, id, 'miracle');
    if (!claimed) return;
    resolutionToken = claimed.fadingSpirits.resolutionInProgress?.token ?? null;
    if (!resolutionToken) return notify('warn', 'IFS.Errors.ResolutionInProgress');
    const current = readActorState(actor);
    const inFlight = current.fadingSpirits.resolutionInProgress;
    if (!isActiveGmWriter() || stableAttemptId(actor, current, 'miracle') !== id
      || !inFlight || inFlight.id !== id || inFlight.mode !== 'miracle' || inFlight.startedBy !== game.user.id
      || inFlight.token !== resolutionToken) {
      return notify('warn', 'IFS.Errors.ActiveGmOnly');
    }
  const resolved = resolveAttempt(current.fadingSpirits, {
    id, mode: 'miracle', at: Date.now(), gmId: game.user.id, dc: 0,
    dieSucceeded: true, soulWilling,
  });
  current.fadingSpirits = resolved.state;
  if (resolved.returned) current.injury.suppressNextRecovery = { transactionId: id, reason: 'miracle-success' };
  await writeActorState(actor, current, `${id}:write`);
  await createAuditSummary(actor, 'miracle', 0, 0, 0, resolved.result);
  } catch (error) {
    notifyException(error);
  } finally {
    if (resolutionToken) await releaseInstantResolution(actor, id, resolutionToken);
    resolutionLocks.delete(lockKey);
  }
}

async function claimInstantResolution(actor: any, id: string, mode: 'rapid' | 'miracle'): Promise<ReturnType<typeof readActorState> | null> {
  if (!isActiveGmWriter()) {
    notify('warn', 'IFS.Errors.ActiveGmOnly');
    return null;
  }
  return withResolutionClaimQueue(`${actor.uuid}:${id}`, async () => {
  const current = readActorState(actor);
  if (stableAttemptId(actor, current, mode) !== id || current.fadingSpirits.resurrectionConsumedForCurrentDeath
    || (mode === 'rapid' && current.fadingSpirits.rapidResurrectionLockedForCurrentDeath)
    || (mode === 'miracle' && (current.fadingSpirits.rapidResurrectionLockedForCurrentDeath
      || current.fadingSpirits.conventionalResurrectionLocked))) {
    notify('warn', 'IFS.Errors.RitualMissing');
    return null;
  }
  const existing = current.fadingSpirits.resolutionInProgress;
  if (existing && resolutionOwnerIsActive(existing.startedBy)) {
    notify('warn', 'IFS.Errors.ResolutionInProgress');
    return null;
  }
  const token = resolutionLockToken();
  if (!await acquireResolutionDocumentLock(actor, id, mode, token)) {
    notify('warn', 'IFS.Errors.ResolutionInProgress');
    return null;
  }
  current.fadingSpirits.resolutionInProgress = {
    id, mode, startedAt: Date.now(), startedBy: game.user.id, token,
  };
  try {
    await writeActorState(actor, current, `${id}:claim`);
  } catch (error) {
    await releaseResolutionDocumentLock(actor, id, token);
    throw error;
  }
  const claimed = readActorState(actor);
  const inFlight = claimed.fadingSpirits.resolutionInProgress;
  if (!isActiveGmWriter() || !inFlight || inFlight.id !== id || inFlight.mode !== mode || inFlight.startedBy !== game.user.id
    || !inFlight.token) {
    notify('warn', 'IFS.Errors.ActiveGmOnly');
    return null;
  }
  return claimed;
  });
}

async function withResolutionClaimQueue<T>(key: string, callback: () => Promise<T>): Promise<T> {
  const previous = resolutionClaimQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  resolutionClaimQueues.set(key, tail);
  await previous;
  try {
    return await callback();
  } finally {
    release();
    if (resolutionClaimQueues.get(key) === tail) resolutionClaimQueues.delete(key);
  }
}

async function releaseInstantResolution(actor: any, id: string, token: string): Promise<void> {
  if (!isActiveGmWriter()) return;
  const current = readActorState(actor);
  const inFlight = current.fadingSpirits.resolutionInProgress;
  if (!inFlight || inFlight.id !== id || inFlight.startedBy !== game.user.id || inFlight.token !== token) {
    await releaseResolutionDocumentLock(actor, id, token);
    return;
  }
  current.fadingSpirits.resolutionInProgress = null;
  try {
    await writeActorState(actor, current, `${id}:release`);
    await releaseResolutionDocumentLock(actor, id, token);
  } catch {
    // The original operation may have lost GM authority; leave both markers
    // for the next active GM to reclaim instead of guessing at state.
  }
}

async function releaseRitualResolution(actor: any, id: string, token: string): Promise<void> {
  if (!isActiveGmWriter()) return;
  const current = readActorState(actor);
  const pending = current.fadingSpirits.pendingRitual;
  const ownsPendingMarker = Boolean(pending && pending.id === id
    && pending.resolutionStartedBy === game.user.id && pending.resolutionToken === token);
  if (ownsPendingMarker && pending) {
    pending.resolutionStartedAt = null;
    pending.resolutionStartedBy = null;
    pending.resolutionToken = null;
    current.fadingSpirits.pendingRitual = pending;
    try {
      await writeActorState(actor, current, `${id}:resolution-release`);
    } catch {
      // Leave both markers for the next active GM if authority changed during cleanup.
      return;
    }
  }
  // resolveAttempt clears pendingRitual on success/failure, so cleanup must
  // still release the matching document lock when no marker remains.
  await releaseResolutionDocumentLock(actor, id, token);
}

async function acquireResolutionDocumentLock(actor: any, id: string, mode: 'normal' | 'final' | 'rapid' | 'miracle', token: string): Promise<boolean> {
  const chatMessageClass = (globalThis as any).ChatMessage;
  if (!isActiveGmWriter() || typeof chatMessageClass?.create !== 'function') return false;
  const lockId = resolutionLockDocumentId(actor.uuid, id);
  const existing = game.messages?.get?.(lockId);
  if (existing) {
    const lock = existing.flags?.[MODULE_ID]?.resolutionLock;
    if (!lock || lock.actorUuid !== actor.uuid || lock.attemptId !== id || lock.mode !== mode) return false;
    if (lock.token === token && lock.startedBy === game.user.id) return true;
    if (resolutionOwnerIsActive(String(lock.startedBy ?? ''))) return false;
    try {
      await existing.delete({ [MODULE_ID]: { internal: true, resolutionLock: true } });
    } catch {
      return false;
    }
  }
  try {
    const created = await chatMessageClass.create({
      _id: lockId,
      content: '',
      whisper: gmRecipients(),
      flags: {
        [MODULE_ID]: {
          resolutionLock: { actorUuid: actor.uuid, attemptId: id, mode, token, startedBy: game.user.id },
        },
      },
    });
    if (!created || created.id !== lockId) {
      try { await created?.delete?.({ [MODULE_ID]: { internal: true, resolutionLock: true } }); } catch { /* fail closed */ }
      return false;
    }
    return true;
  } catch {
    // Foundry's world-document create is the single-winner gate. A duplicate
    // _id means another client won the claim; no Actor state is written here.
    return false;
  }
}

async function releaseResolutionDocumentLock(actor: any, id: string, token: string): Promise<void> {
  if (!isActiveGmWriter()) return;
  const message = game.messages?.get?.(resolutionLockDocumentId(actor.uuid, id));
  const lock = message?.flags?.[MODULE_ID]?.resolutionLock;
  if (!message || !lock || lock.actorUuid !== actor.uuid || lock.attemptId !== id
    || lock.token !== token || lock.startedBy !== game.user.id) return;
  try {
    await message.delete({ [MODULE_ID]: { internal: true, resolutionLock: true } });
  } catch {
    // A stale lock can be reclaimed by a later active GM after ownership changes.
  }
}

async function parseContributors(values: FormValues): Promise<RitualContributor[]> {
  const result: RitualContributor[] = [];
  for (let index = 0; index < 3; index += 1) {
    const actorUuid = String(values[`actor${index}`] ?? '').trim();
    if (!actorUuid) continue;
    const actor = await fromUuid(actorUuid);
    if (!actor || actor.documentName !== 'Actor') throw new Error(`Contributor Actor UUID cannot be resolved: ${actorUuid}`);
    const dc = Number(values[`dc${index}`]);
    if (!Number.isInteger(dc) || dc < 10 || dc > 20) throw new Error('Contribution DC must be an integer from 10 to 20.');
    const mode = String(values[`advantage${index}`]);
    const check = String(values[`check${index}`] ?? '').trim() || 'prc';
    const ability = String(values[`ability${index}`] ?? '').trim() || null;
    if (!CONFIG.DND5E?.skills?.[check]) throw new Error(`Unknown dnd5e 5.3.3 skill id: ${check}`);
    if (ability && !CONFIG.DND5E?.abilities?.[ability]) throw new Error(`Unknown dnd5e 5.3.3 ability id: ${ability}`);
    result.push({
      actorUuid,
      check,
      ability,
      dc,
      advantageMode: mode === 'advantage' || mode === 'disadvantage' ? mode : 'normal',
      requestMessageId: null,
    });
  }
  if (new Set(result.map((entry) => entry.actorUuid)).size !== result.length) throw new Error('Contributors must be distinct Actors.');
  return result;
}

function contributorFields(index: number): string {
  return `<div class="ifs-contributor"><input name="actor${index}" placeholder="${label('IFS.Fading.ActorUuid')}"><input name="check${index}" value="prc" placeholder="${label('IFS.Fading.SkillId')}"><input name="ability${index}" placeholder="${label('IFS.Fading.AbilityOverride')}"><input type="number" name="dc${index}" min="10" max="20" value="15"><select name="advantage${index}"><option value="normal">${label('IFS.Fading.Advantage.Normal')}</option><option value="advantage">${label('IFS.Fading.Advantage.Advantage')}</option><option value="disadvantage">${label('IFS.Fading.Advantage.Disadvantage')}</option></select></div>`;
}

function observedRequestResult(requestId: string | null): { total: number | null; actorName: string | null } {
  const request = requestId ? game.messages.get(requestId) : null;
  const target = request?.system?.targets?.[0];
  const result = target?.result?.rolls ? target.result : typeof target?.result === 'string' ? game.messages.get(target.result) : null;
  const total = Number(result?.rolls?.[0]?.total);
  const actor = target?.actor ? fromUuidSync(target.actor) : null;
  return { total: Number.isFinite(total) ? total : null, actorName: actor?.name ?? null };
}

async function blindRoll(formula: string, data: Record<string, unknown>, flavor: string): Promise<any> {
  const roll = await new Roll(formula, data).evaluate();
  await roll.toMessage({ flavor, speaker: ChatMessage.getSpeaker({ user: game.user }) }, { rollMode: 'blindroll' });
  return roll;
}

async function createAuditSummary(actor: any, mode: string, dc: number, successes: number, failures: number, result: string): Promise<void> {
  await ChatMessage.create({
    content: `<div class="ifs-card"><strong>${escapeHtml(actor.name)}</strong>: ${modeLabel(mode)} — DC ${dc}; ${label('IFS.Fading.Contributions')} ${successes}/${failures}; ${label('IFS.Fading.ResultLabel')} <strong>${escapeHtml(resultLabel(result))}</strong>. ${label('IFS.Fading.BlindDieNotice')}</div>`,
    whisper: gmRecipients(),
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [MODULE_ID]: { card: 'audit', mode, dc, successes, failures, result } },
  });
}

function gmRecipients(): string[] {
  return (ChatMessage.getWhisperRecipients?.('GM') ?? []).map((user: any) => user.id);
}

function formValues(form: HTMLFormElement | undefined): FormValues {
  return form ? Object.fromEntries(new FormData(form)) : {};
}

function dialogWait(config: Record<string, unknown>): Promise<unknown> {
  const dialog = foundry?.applications?.api?.DialogV2;
  if (!dialog?.wait) throw new Error('Foundry 14 DialogV2.wait is unavailable.');
  return dialog.wait({ modal: true, rejectClose: false, ...config });
}

function stableAttemptId(actor: any, state: ReturnType<typeof readActorState>, mode: 'normal' | 'rapid' | 'miracle' | 'final'): string {
  return resurrectionTransactionId(
    actor.uuid,
    state.fadingSpirits.currentDeathEpisodeId,
    mode,
    state.fadingSpirits.attemptHistory.length + 1,
  );
}

function resolutionOwnerIsActive(userId: string): boolean {
  return game.users?.get?.(userId)?.active === true;
}

function resolutionLockToken(): string {
  const cryptoApi = (globalThis as any).crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  const counter = ((globalThis as any).__fvttIfsResolutionCounter ?? 0) + 1;
  (globalThis as any).__fvttIfsResolutionCounter = counter;
  return `${game.user.id}:${Date.now()}:${counter}`;
}

function resolutionLockDocumentId(actorUuid: string, attemptId: string): string {
  let hash = 1469598103934665603n;
  const mask = (1n << 64n) - 1n;
  for (const char of `${actorUuid}|${attemptId}`) {
    hash ^= BigInt(char.charCodeAt(0));
    hash = (hash * 1099511628211n) & mask;
  }
  return hash.toString(36).padStart(16, '0').slice(-16);
}

function label(key: string): string {
  return game.i18n?.localize?.(key) ?? key;
}

function modeOption(value: string, key: string, selected = false): string {
  return `<option value="${escapeAttribute(value)}"${selected ? ' selected' : ''}>${escapeHtml(label(key))}</option>`;
}

function modeLabel(mode: string): string {
  const keys: Record<string, string> = {
    normal: 'IFS.Fading.Modes.Normal',
    final: 'IFS.Fading.Modes.Final',
    rapid: 'IFS.Fading.Modes.Rapid',
    miracle: 'IFS.Fading.Modes.Miracle',
  };
  return label(keys[mode] ?? mode);
}

function resultLabel(result: string): string {
  return label(`IFS.Fading.Result.${result}`);
}

function notify(level: 'warn' | 'error' | 'info', key: string): void {
  ui.notifications?.[level]?.(key.includes('.') ? label(key) : key);
}

function notifyException(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const exact: Record<string, string> = {
    'A ritual is already pending.': 'IFS.Errors.RitualPending',
    'The soul has already returned for the current death episode.': 'IFS.Errors.ResurrectionAlreadyConsumed',
    'A resurrection resolution is already in progress.': 'IFS.Errors.ResolutionInProgress',
    'Conventional resurrection is permanently locked.': 'IFS.Errors.ConventionalLocked',
    'A final ritual requires a prior conventional failure.': 'IFS.Errors.FinalRequiresFailure',
    'The final ritual chance has already been used.': 'IFS.Errors.FinalChanceUsed',
    'A ritual allows at most three distinct contributors.': 'IFS.Errors.MaxContributors',
    'A different resurrection resolution is already in progress.': 'IFS.Errors.DifferentResolution',
    'The ritual transaction is not the currently pending ritual.': 'IFS.Errors.TransactionMismatch',
    'Rapid resurrection is locked for the current death episode.': 'IFS.Errors.RapidLocked',
    'This death episode requires a long-casting resurrection ritual.': 'IFS.Errors.LongCastingRequired',
    'A locked soul must use the one final ritual chance.': 'IFS.Errors.FinalChanceRequired',
    'Ritual contributors must be distinct actors.': 'IFS.Errors.DistinctContributors',
    'Contribution DC must be an integer from 10 to 20.': 'IFS.Errors.ContributionDcInvalid',
    'Foundry 14 DialogV2.wait is unavailable.': 'IFS.Errors.DialogUnavailable',
  };
  if (exact[message]) return notify('error', exact[message]!);
  const prefixed: Array<[string, string]> = [
    ['Contributor Actor UUID cannot be resolved: ', 'IFS.Errors.ContributorActorInvalid'],
    ['Unknown dnd5e 5.3.3 skill id: ', 'IFS.Errors.UnknownSkill'],
    ['Unknown dnd5e 5.3.3 ability id: ', 'IFS.Errors.UnknownAbility'],
  ];
  const match = prefixed.find(([prefix]) => message.startsWith(prefix));
  if (match) return notify('error', `${label(match[1])}: ${message.slice(match[0].length)}`);
  notify('error', message);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function escapeAttribute(value: unknown): string {
  return escapeHtml(value);
}
