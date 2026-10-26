/** Local Bridge 0.8.4 recovery adapter. Transport availability is not a world-read PASS. */
export const RECOVERY_VERSION = 'local-recovery-1';
const MAX_EVENTS = 64;
const REASONS = new Set(['startup', 'transport_unavailable', 'configuration_invalid', 'identity_rejected', 'manual_stop', 'bridge_disabled', 'page_closed', 'recovered']);

export function classifyRecoveryFailure(error) {
  const message = String(error?.message ?? error);
  if (/invalid configuration|module not initialized/i.test(message)) return 'configuration_invalid';
  if (/identity|origin.*reject|configuration mismatch|forbidden|permission denied/i.test(message)) return 'identity_rejected';
  return 'transport_unavailable';
}

export function installBridgeRecovery(bridge, options = {}) {
  if (bridge.recoveryVersion === RECOVERY_VERSION) return bridge;
  const clock = options.clock ?? Date.now;
  const storage = options.storage ?? globalThis.localStorage;
  const log = options.log ?? (event => console.info('[foundry-mcp-recovery]', JSON.stringify(event)));
  const worldId = options.worldId ?? globalThis.game?.world?.id ?? 'world';
  const storageKey = `foundry-mcp-bridge.recovery.${encodeURIComponent(worldId)}.v1`;
  let history = [];
  try {
    const saved = JSON.parse(storage?.getItem(storageKey) ?? '[]');
    if (Array.isArray(saved)) history = saved.filter(event => event && typeof event.at === 'string' && Number.isFinite(Date.parse(event.at))
      && ['connected', 'disconnected', 'retry_failed', 'stopped', 'page_closed'].includes(event.event)
      && REASONS.has(event.reason)).slice(-MAX_EVENTS).map(({ at, event, reason, attempt }) => ({ at, event, reason, attempt: Number.isSafeInteger(attempt) && attempt >= 0 ? attempt : 0 }));
  } catch { /* Corrupt client history must not block the connection. */ }
  const state = { wanted: false, epoch: 0, inFlight: false, failures: 0, nextAttemptAt: 0, blockedReason: null, config: '', connected: null, recovering: false };
  const originalStart = bridge.start.bind(bridge);
  const originalStop = bridge.stop.bind(bridge);
  const enabled = () => bridge.isInitialized && bridge.isGMUser() && bridge.settings.getSetting('enabled');
  const configKey = () => JSON.stringify(bridge.settings.getBridgeConfig());
  const emit = (event, reason) => {
    const row = { at: new Date(clock()).toISOString(), event, reason, attempt: state.failures };
    history.push(row);
    history = history.slice(-MAX_EVENTS);
    try { storage?.setItem(storageKey, JSON.stringify(history)); } catch { /* Storage is optional. */ }
    try { log(row); } catch { /* Observability must not break recovery. */ }
  };
  const observe = () => {
    const connected = bridge.socketBridge?.isConnected() ?? false;
    if (connected !== state.connected) {
      if (!connected && state.connected === true) state.recovering = true;
      emit(connected ? 'connected' : 'disconnected', connected ? (state.failures || state.recovering ? 'recovered' : 'startup') : 'transport_unavailable');
      state.connected = connected;
    }
    if (connected) { state.failures = 0; state.nextAttemptAt = 0; state.blockedReason = null; state.recovering = false; }
    return connected;
  };
  const monitor = () => {
    if (state.wanted && enabled() && bridge.heartbeatInterval === null) bridge.startHeartbeat();
  };
  const failed = error => {
    state.failures++;
    const reason = classifyRecoveryFailure(error);
    state.blockedReason = reason === 'transport_unavailable' ? null : reason;
    state.nextAttemptAt = clock() + Math.min(5000 * 2 ** Math.min(state.failures - 1, 5), 60000);
    emit('retry_failed', reason);
    observe();
  };

  bridge.recoveryVersion = RECOVERY_VERSION;
  bridge.configureRecoverySocket = socket => {
    // One recovery owner: upstream per-socket timers otherwise ignore user intent
    // and can reconnect a detached socket after an explicit Bridge stop.
    socket.scheduleReconnect = () => {};
    const connect = socket.connect.bind(socket);
    const disconnect = socket.disconnect.bind(socket);
    let disposed = false, cancelPending = null, cleanupEvents = () => {};
    socket.connect = async () => {
      if (disposed) throw new Error('Bridge connection cancelled');
      const cancellation = new Promise((_, reject) => { cancelPending = reject; });
      const pending = connect();
      const ws = socket.ws;
      if (ws?.addEventListener) {
        const transition = () => { if (!disposed && state.wanted && bridge.socketBridge === socket) observe(); };
        for (const name of ['open', 'close', 'error']) ws.addEventListener(name, transition);
        cleanupEvents = () => { for (const name of ['open', 'close', 'error']) ws.removeEventListener(name, transition); };
      }
      try { await Promise.race([pending, cancellation]); }
      finally { cancelPending = null; }
    };
    socket.disconnect = () => {
      disposed = true;
      cancelPending?.(new Error('Bridge connection cancelled'));
      cleanupEvents();
      if (socket.ws) for (const name of ['onopen', 'onclose', 'onerror', 'onmessage']) socket.ws[name] = null;
      disconnect();
    };
  };
  bridge.start = async function (...args) {
    if (!enabled()) return;
    const epoch = ++state.epoch;
    state.wanted = true;
    state.blockedReason = null;
    state.config = configKey();
    state.failures = 0;
    state.nextAttemptAt = 0;
    try { await originalStart(...args); observe(); }
    catch (error) { if (epoch === state.epoch && state.wanted && enabled()) failed(error); throw error; }
    finally {
      if (epoch !== state.epoch || !state.wanted || !enabled()) {
        // A stop/disable during an in-flight start must win over its completion.
        if (!state.wanted || !enabled()) await originalStop();
      } else monitor();
    }
  };
  bridge.stop = async function (...args) {
    state.wanted = false;
    state.epoch++;
    state.nextAttemptAt = 0;
    state.recovering = false;
    emit('stopped', bridge.settings.getSetting('enabled') ? 'manual_stop' : 'bridge_disabled');
    await originalStop(...args);
    state.connected = false;
  };
  bridge.performHeartbeat = async function () {
    if (!state.wanted || !enabled()) return;
    if (observe()) { bridge.updateLastActivity(); return; }
    if (!bridge.settings.getSetting('autoReconnectEnabled') || state.inFlight || bridge.isConnecting) return;
    const configuration = configKey();
    if (configuration !== state.config) {
      state.config = configuration;
      state.blockedReason = null;
      state.failures = 0;
      state.nextAttemptAt = 0;
    }
    if (state.blockedReason || clock() < state.nextAttemptAt) return;
    const epoch = state.epoch;
    state.inFlight = true;
    try {
      // Use the original lifecycle, without treating this internal stop as user intent.
      await originalStop();
      if (epoch !== state.epoch || !state.wanted || !enabled()) return;
      await originalStart();
      observe();
    } catch (error) { if (epoch === state.epoch && state.wanted && enabled()) failed(error); }
    finally {
      state.inFlight = false;
      if (epoch !== state.epoch || !state.wanted || !enabled()) {
        if (!state.wanted || !enabled()) await originalStop();
      } else monitor();
    }
  };
  bridge.getRecoveryStatus = () => {
    const transportConnected = observe();
    return {
      version: RECOVERY_VERSION, transportConnected, monitoring: bridge.heartbeatInterval !== null,
      autoReconnectEnabled: Boolean(bridge.settings.getSetting('autoReconnectEnabled')),
      failures: state.failures, nextAttemptAt: state.nextAttemptAt ? new Date(state.nextAttemptAt).toISOString() : null,
      blockedReason: state.blockedReason, history: history.map(event => ({ ...event })),
    };
  };
  const onPageHide = () => { state.wanted = false; state.epoch++; emit('page_closed', 'page_closed'); bridge.stopHeartbeat(); };
  options.addPageHideListener?.(onPageHide);
  if (!options.addPageHideListener && typeof globalThis.addEventListener === 'function') globalThis.addEventListener('pagehide', onPageHide, { once: true });
  return bridge;
}
