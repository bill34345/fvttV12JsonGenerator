import { describe, expect, test } from 'bun:test';

import {
  COMPANION_CONTROL_HEADER,
  COMPANION_CONTROL_PROTOCOL_VERSION,
  COMPANION_CONTROL_URL,
  COMPANION_LOCAL_WEB_ORIGIN,
} from './controlProtocol';
import { createCompanionControlService, type CompanionRunInput } from './controlService';

const REMOTE_ORIGIN = 'https://table.example';
const OTHER_REMOTE_ORIGIN = 'https://other-table.example';
const INSTANCE_ID = 'instance_0123456789abcdefghijklmn';
const PAIRING_ID = 'pairing_0123456789abcdefghijklmn';
const PAIRING_TOKEN = 'pairing_token_0123456789abcdefghijklmnopqrstuvwxyz';

function controlRequest(
  path: string,
  origin: string,
  body?: unknown,
): Request {
  return new Request(`http://127.0.0.1:43173${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      origin,
      [COMPANION_CONTROL_HEADER]: String(COMPANION_CONTROL_PROTOCOL_VERSION),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function approvalPageRequest(approvalId: string): Request {
  return new Request(`http://127.0.0.1:43173/v2/approve?origin=${encodeURIComponent(REMOTE_ORIGIN)}&approvalId=${approvalId}&pairingId=${PAIRING_ID}`);
}

async function approve(service: ReturnType<typeof createCompanionControlService>, approvalId: string): Promise<string> {
  const body = new URLSearchParams({ approvalId, action: 'approve' });
  const response = await service.fetch(new Request('http://127.0.0.1:43173/v2/approve', {
    method: 'POST',
    headers: {
      origin: COMPANION_CONTROL_URL,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  }));
  expect(response.status).toBe(200);
  const message = await response.text();
  const match = /"pairAuthorization":"([A-Za-z0-9_-]{32,})"/u.exec(message);
  expect(match?.[1]).toBeTruthy();
  return match![1]!;
}

describe('local Companion remote control approval', () => {
  test('requires an explicit local confirmation, binds it to the exact remote origin and consumes it once', async () => {
    const runs: CompanionRunInput[] = [];
    const service = createCompanionControlService({
      instanceId: INSTANCE_ID,
      startRun: async (input) => { runs.push(input); },
    });
    const approvalId = 'approval_0123456789abcdefghijklmn';

    const page = await service.fetch(approvalPageRequest(approvalId));
    expect(page.status).toBe(200);
    expect(await page.text()).toContain(REMOTE_ORIGIN);

    const beforeApproval = await service.fetch(controlRequest('/v2/pair', REMOTE_ORIGIN, {
      protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
      instanceId: INSTANCE_ID,
      origin: REMOTE_ORIGIN,
      pairingId: PAIRING_ID,
      pairingToken: PAIRING_TOKEN,
    }));
    expect(beforeApproval.status).toBe(403);

    const crossSitePost = await service.fetch(new Request('http://127.0.0.1:43173/v2/approve', {
      method: 'POST',
      headers: {
        origin: REMOTE_ORIGIN,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ approvalId, action: 'approve' }),
    }));
    expect(crossSitePost.status).toBe(403);

    const pendingPreflight = await service.fetch(new Request('http://127.0.0.1:43173/v2/pair', {
      method: 'OPTIONS',
      headers: { origin: REMOTE_ORIGIN },
    }));
    expect(pendingPreflight.status).toBe(403);
    expect(pendingPreflight.headers.get('access-control-allow-origin')).toBeNull();

    const pairAuthorization = await approve(service, approvalId);
    const approvalPage = await service.fetch(approvalPageRequest(approvalId));
    expect(await approvalPage.text()).not.toContain(PAIRING_TOKEN);
    const approvedPreflight = await service.fetch(new Request('http://127.0.0.1:43173/v2/pair', {
      method: 'OPTIONS',
      headers: { origin: REMOTE_ORIGIN },
    }));
    expect(approvedPreflight.status).toBe(204);
    expect(approvedPreflight.headers.get('access-control-allow-origin')).toBe(REMOTE_ORIGIN);
    expect(approvedPreflight.headers.get('access-control-allow-private-network')).toBe('true');

    const paired = await service.fetch(controlRequest('/v2/pair', REMOTE_ORIGIN, {
      protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
      instanceId: INSTANCE_ID,
      origin: REMOTE_ORIGIN,
      pairingId: PAIRING_ID,
      pairingToken: PAIRING_TOKEN,
      approvalId,
      pairAuthorization,
    }));
    expect(paired.status).toBe(200);
    expect(paired.headers.get('access-control-allow-origin')).toBe(REMOTE_ORIGIN);
    const pairPayload = await paired.json() as { controlCredential: string };
    expect(pairPayload.controlCredential).toBeTruthy();
    expect(runs).toEqual([{ origin: REMOTE_ORIGIN, pairingId: PAIRING_ID, pairingToken: PAIRING_TOKEN }]);

    await Promise.resolve();
    const replay = await service.fetch(controlRequest('/v2/pair', REMOTE_ORIGIN, {
      protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
      instanceId: INSTANCE_ID,
      origin: REMOTE_ORIGIN,
      pairingId: PAIRING_ID,
      pairingToken: PAIRING_TOKEN,
      approvalId,
      pairAuthorization,
    }));
    expect(replay.status).toBe(403);

    const disconnect = await service.fetch(controlRequest('/v2/disconnect', REMOTE_ORIGIN, {
      protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
      instanceId: INSTANCE_ID,
      controlCredential: pairPayload.controlCredential,
    }));
    expect(disconnect.status).toBe(200);
    expect(disconnect.headers.get('access-control-allow-origin')).toBe(REMOTE_ORIGIN);

    const replayedDisconnect = await service.fetch(controlRequest('/v2/disconnect', REMOTE_ORIGIN, {
      protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
      instanceId: INSTANCE_ID,
      controlCredential: pairPayload.controlCredential,
    }));
    expect(replayedDisconnect.status).toBe(403);
  });

  test('does not disclose or honor an approval from another browser origin', async () => {
    const service = createCompanionControlService({
      instanceId: INSTANCE_ID,
      startRun: async () => undefined,
    });
    const approvalId = 'approval_other_0123456789abcdefghijk';
    await service.fetch(approvalPageRequest(approvalId));
    const pairAuthorization = await approve(service, approvalId);

    const otherOriginPreflight = await service.fetch(new Request('http://127.0.0.1:43173/v2/pair', {
      method: 'OPTIONS',
      headers: { origin: OTHER_REMOTE_ORIGIN },
    }));
    expect(otherOriginPreflight.status).toBe(403);

    const forgedOrigin = await service.fetch(controlRequest('/v2/pair', OTHER_REMOTE_ORIGIN, {
      protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
      instanceId: INSTANCE_ID,
      origin: REMOTE_ORIGIN,
      pairingId: PAIRING_ID,
      pairingToken: PAIRING_TOKEN,
      approvalId,
      pairAuthorization,
    }));
    expect(forgedOrigin.status).toBe(400);
  });

  test('does not let another browser session reuse a trusted site approval', async () => {
    const service = createCompanionControlService({
      instanceId: INSTANCE_ID,
      startRun: async () => undefined,
    });
    const approvalId = 'approval_session_0123456789abcdefghijk';
    await service.fetch(approvalPageRequest(approvalId));
    await approve(service, approvalId);

    const unknownSessionPair = await service.fetch(controlRequest('/v2/pair', REMOTE_ORIGIN, {
      protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
      instanceId: INSTANCE_ID,
      origin: REMOTE_ORIGIN,
      pairingId: PAIRING_ID,
      pairingToken: PAIRING_TOKEN,
      approvalId: 'approval_fresh_session_0123456789abcdef',
      pairAuthorization: 'authorization_0123456789abcdefghijklmnopqrstuvwxyz',
    }));
    expect(unknownSessionPair.status).toBe(403);

    const removedStatusEndpoint = await service.fetch(controlRequest(`/v2/approvals/${approvalId}`, REMOTE_ORIGIN));
    expect(removedStatusEndpoint.status).toBe(405);
    expect(await removedStatusEndpoint.text()).not.toContain('pairAuthorization');
  });

  test('expires pending approval and keeps direct local development available', async () => {
    let clock = 0;
    const service = createCompanionControlService({
      instanceId: INSTANCE_ID,
      now: () => clock,
      startRun: async () => undefined,
    });
    const approvalId = 'approval_expired_0123456789abcdefghijk';
    await service.fetch(approvalPageRequest(approvalId));
    clock = 5 * 60 * 1_000 + 1;
    const expiredPair = await service.fetch(controlRequest('/v2/pair', REMOTE_ORIGIN, {
      protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
      instanceId: INSTANCE_ID,
      origin: REMOTE_ORIGIN,
      pairingId: PAIRING_ID,
      pairingToken: PAIRING_TOKEN,
      approvalId,
      pairAuthorization: 'authorization_0123456789abcdefghijklmnopqrstuvwxyz',
    }));
    expect(expiredPair.status).toBe(403);

    const health = await service.fetch(controlRequest('/v2/health', COMPANION_LOCAL_WEB_ORIGIN));
    expect(health.status).toBe(200);
    const pair = await service.fetch(controlRequest('/v2/pair', COMPANION_LOCAL_WEB_ORIGIN, {
      protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
      instanceId: INSTANCE_ID,
      origin: COMPANION_LOCAL_WEB_ORIGIN,
      pairingId: PAIRING_ID,
      pairingToken: PAIRING_TOKEN,
    }));
    expect(pair.status).toBe(200);
    const noCredential = await service.fetch(controlRequest('/v2/shutdown', COMPANION_LOCAL_WEB_ORIGIN, {
      protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
      instanceId: INSTANCE_ID,
      controlCredential: 'wrong_control_0123456789abcdefghijklmnopqrstuvwxyz',
    }));
    expect(noCredential.status).toBe(403);
  });
});
