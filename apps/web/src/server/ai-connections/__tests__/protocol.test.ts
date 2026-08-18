import { describe, expect, it } from 'bun:test';

import {
  COMPANION_PROTOCOL_VERSION,
  decodeCompanionMessage,
  isCompanionGate,
  isCompanionPair,
  isCompanionRequest,
  isCompanionResponse,
} from '../protocol';

describe('Codex Companion protocol v1', () => {
  it('accepts only versioned gate and request envelopes', () => {
    const gate = decodeCompanionMessage(JSON.stringify({
      type: 'gate',
      protocolVersion: COMPANION_PROTOCOL_VERSION,
      connectionId: 'connection-1',
      models: [{ model: 'gpt-5.6-luna', reasoningEffort: 'xhigh' }],
    }));
    expect(isCompanionGate(gate)).toBe(true);
    expect(isCompanionGate({ ...gate as object, protocolVersion: 2 })).toBe(false);

    const request = {
      type: 'request',
      protocolVersion: COMPANION_PROTOCOL_VERSION,
      requestId: 'request-1',
      url: '/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    };
    expect(isCompanionRequest(request)).toBe(true);
    expect(isCompanionRequest({ ...request, protocolVersion: 0 })).toBe(false);
  });

  it('requires a version on response envelopes as well', () => {
    expect(isCompanionResponse({
      type: 'response',
      protocolVersion: COMPANION_PROTOCOL_VERSION,
      requestId: 'request-1',
      status: 200,
      body: {},
    })).toBe(true);
    expect(isCompanionResponse({ type: 'response', requestId: 'request-1', status: 200, body: {} })).toBe(false);
  });

  it('carries pairing material in the first WebSocket frame instead of the URL', () => {
    const pair = {
      type: 'pair',
      protocolVersion: COMPANION_PROTOCOL_VERSION,
      pairingId: 'A'.repeat(24),
      token: 'B'.repeat(32),
      origin: 'http://127.0.0.1:5173',
    };
    expect(isCompanionPair(pair)).toBe(true);
    expect(isCompanionPair({ ...pair, protocolVersion: 2 })).toBe(false);
    expect(isCompanionPair({ ...pair, token: 'token' })).toBe(false);
  });
});
