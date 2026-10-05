interface MidiActivityUse {
  activity: any;
  sequenceId: string;
  usage: Record<string, any>;
  dialog?: Record<string, any>;
  message?: Record<string, any>;
  globals: any;
  signal?: AbortSignal;
}

export interface MidiActivityObservation {
  event: 'attack' | 'abort' | 'cleanup' | 'refused';
  workflow?: any;
  results?: any;
}

/** Wait for this exact local use's public terminal event, not Midi's 90s convenience-wrapper deadline. */
export function useMidiActivityUntilTerminal(input: MidiActivityUse): Promise<any> {
  return observeMidiActivity(input, false).then(observation => observation.workflow ?? observation.results);
}

/** Public use starts one attack; a manual damage step may keep Midi's workflow open afterward. */
export function useMidiActivityUntilAttack(input: MidiActivityUse): Promise<MidiActivityObservation> {
  return observeMidiActivity(input, true);
}

function observeMidiActivity(input: MidiActivityUse, finishOnAttack: boolean): Promise<MidiActivityObservation> {
  const { activity, sequenceId, globals, signal } = input;
  const hooks = globals?.Hooks;
  if (!activity?.uuid || typeof activity.use !== 'function' || !sequenceId
    || typeof hooks?.on !== 'function' || typeof hooks?.off !== 'function') {
    return Promise.reject(new Error('Midi Activity use and correlated lifecycle hooks are required.'));
  }
  if (signal?.aborted) return Promise.reject(new Error('Midi child observation stopped; reconcile before retry.'));
  const user = globals?.game?.user;
  const tokenLayer = globals?.canvas?.tokens;
  const sceneId = globals?.canvas?.scene?.id;
  const savedTargets: string[] = [...(user?.targets ?? [])].map((token: any) => token.id);
  const suppliedTargets: string[] = [...(input.usage.midiOptions?.targetsToUse ?? [])].map((token: any) => token.id);
  return new Promise((resolve, reject) => {
    const listeners: Array<{ name: string; id: any }> = [];
    let finished = false;
    let resolveUse!: (value: any) => void;
    let rejectUse!: (error: unknown) => void;
    const used = new Promise<any>((resolve, reject) => { resolveUse = resolve; rejectUse = reject; });
    const finish = (error: unknown, event: MidiActivityObservation['event'], workflow?: any) => {
      if (finished) return;
      finished = true;
      for (const { name, id } of listeners) hooks.off(name, id);
      signal?.removeEventListener('abort', stopped);
      // Midi's public Activity sets user targets from targetsToUse. Restore
      // our change only while those targets still match, never a later user selection.
      const current = [...(user?.targets ?? [])].map((token: any) => token.id).sort();
      if (sceneId && globals?.canvas?.scene?.id === sceneId && globals?.canvas?.tokens === tokenLayer
        && suppliedTargets.length && JSON.stringify(current) === JSON.stringify([...suppliedTargets].sort())) {
        try { tokenLayer.setTargets(savedTargets, { mode: 'replace' }); }
        catch (restoreError) { globals?.console?.warn?.('WMP: could not restore the previous token targets.', restoreError); }
      }
      if (error) reject(error);
      else used.then(results => resolve({ event, workflow, results }), reject);
    };
    const stopped = () => finish(new Error('Midi child observation stopped; reconcile before retry.'), 'refused');
    used.then(result => { if (!result) finish(null, 'refused'); }, error => finish(error, 'refused'));
    try {
      for (const name of [`midi-qol.preAbort.${activity.uuid}`, `midi-qol.postCleanup.${activity.uuid}`]) {
        const event = name.includes('.preAbort.') ? 'abort' : 'cleanup';
        listeners.push({ name, id: hooks.on(name, (workflow: any) => {
          if (workflow?.sequenceId === sequenceId) finish(null, event, workflow);
        }) });
      }
      if (finishOnAttack) {
        const name = 'midi-qol.AttackRollComplete';
        listeners.push({ name, id: hooks.on(name, (workflow: any) => {
          if (workflow?.sequenceId === sequenceId && workflow?.activity?.uuid === activity.uuid) finish(null, 'attack', workflow);
        }) });
      }
      signal?.addEventListener('abort', stopped, { once: true });
      const usage = { ...input.usage, sequenceId, midiOptions: { ...input.usage.midiOptions,
        workflowOptions: { ...input.usage.midiOptions?.workflowOptions, forceCompletion: true } } };
      resolveUse(activity.use(usage, input.dialog ?? {}, input.message ?? {}));
    } catch (error) { rejectUse(error); }
  });
}
