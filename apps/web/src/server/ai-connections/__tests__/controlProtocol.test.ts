import { describe, expect, it } from 'bun:test';

import {
  COMPANION_CONTROL_PROTOCOL_VERSION,
  COMPANION_SERVICE_NAME,
  isLocalCompanionActionResponse,
  isLocalCompanionHealth,
  isLocalCompanionPairResponse,
} from '../../../companion/controlProtocol';

describe('Companion control protocol v1', () => {
  it('accepts only the documented health states and version', () => {
    expect(isLocalCompanionHealth({
      protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
      service: COMPANION_SERVICE_NAME,
      version: '1.0.0',
      instanceId: 'instance',
      status: 'idle',
    })).toBe(true);
    expect(isLocalCompanionHealth({
      protocolVersion: 2,
      service: COMPANION_SERVICE_NAME,
      version: '1.0.0',
      instanceId: 'instance',
      status: 'idle',
    })).toBe(false);
    expect(isLocalCompanionHealth({
      protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
      service: COMPANION_SERVICE_NAME,
      version: '1.0.0',
      instanceId: 'instance',
      status: 'unknown',
    })).toBe(false);
  });

  it('rejects malformed control responses', () => {
    expect(isLocalCompanionPairResponse({ accepted: true, instanceId: 'instance', status: 'connecting' })).toBe(true);
    expect(isLocalCompanionPairResponse({ accepted: true, instanceId: 'instance', status: 'connected' })).toBe(false);
    expect(isLocalCompanionActionResponse({ accepted: true, instanceId: 'instance', status: 'connected' })).toBe(true);
    expect(isLocalCompanionActionResponse({ accepted: true, instanceId: 'instance', status: 'bad' })).toBe(false);
  });
});
