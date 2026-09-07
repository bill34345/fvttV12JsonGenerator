import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  CompanionControlClient,
  type RemoteCompanionApproval,
} from '../companionControl';
import {
  COMPANION_CONTROL_HEADER,
  COMPANION_CONTROL_PROTOCOL_VERSION,
  COMPANION_CONTROL_URL,
  COMPANION_LOCAL_WEB_ORIGIN,
} from '../../companion/controlProtocol';
import {
  installBrowser,
  installFetch,
  globalsAreRestored,
  jsonResponse,
  restoreTestGlobals,
  type BrowserHarness,
} from './browserTestHarness';

beforeEach(() => {
  expect(globalsAreRestored()).toBe(true);
});

afterEach(() => {
  restoreTestGlobals();
});

const REMOTE_ORIGIN = 'https://remote.example.test';
const CONTROL_URL = COMPANION_CONTROL_URL;
const INSTANCE_ID = 'instance-12345678901234567890';
const PAIRING_TOKEN = 'pairing-token';
const PAIR_AUTHORIZATION = 'pair-authorization-123456789012345';

const HEALTH = {
  protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
  service: 'fvtt-ai-companion',
  version: '1.0.0',
  instanceId: INSTANCE_ID,
  status: 'idle',
} as const;

const PAIR_RESPONSE = {
  accepted: true,
  instanceId: INSTANCE_ID,
  status: 'connecting',
  controlCredential: 'control-credential-123456789012345',
} as const;

const ACTION_RESPONSE = {
  accepted: true,
  instanceId: INSTANCE_ID,
  status: 'connected',
} as const;

interface FetchCall {
  input: RequestInfo | URL;
  init?: RequestInit;
}

interface PopupMock {
  closed: boolean;
  location: { href: string };
}

function createPopup(): PopupMock {
  return { closed: false, location: { href: '' } } as unknown as PopupMock;
}

function queueFetch(payloads: unknown[]): FetchCall[] {
  const calls: FetchCall[] = [];
  installFetch(async (input, init) => {
    calls.push({ input, init });
    const payload = payloads.shift();
    if (payload === undefined) throw new Error('unexpected fetch call');
    return jsonResponse(payload);
  });
  return calls;
}

function pathOf(call: FetchCall): string {
  return String(call.input);
}

function callAt(calls: FetchCall[], index: number): FetchCall {
  const call = calls[index];
  if (!call) throw new Error(`missing fetch call ${index}`);
  return call;
}

function bodyOf(call: FetchCall): Record<string, unknown> {
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

function setupApproval(): {
  client: CompanionControlClient;
  browser: BrowserHarness;
  popup: PopupMock;
  promise: Promise<RemoteCompanionApproval>;
  approvalId: string;
} {
  const browser = installBrowser(REMOTE_ORIGIN);
  const popup = createPopup();
  const client = new CompanionControlClient();
  const promise = client.waitForRemoteApproval(CONTROL_URL, 'pairing / id', popup as unknown as Window);
  const confirmationUrl = new URL(popup.location.href);
  return {
    client,
    browser,
    popup,
    promise,
    approvalId: confirmationUrl.searchParams.get('approvalId') ?? '',
  };
}

function emitApproval(
  browser: BrowserHarness,
  popup: PopupMock,
  approvalId: string,
  status: 'approved' | 'rejected',
): void {
  browser.emitMessage({
    origin: CONTROL_URL,
    source: popup,
    data: status === 'approved'
      ? {
          type: 'fvtt-companion-approval',
          approvalId,
          status,
          instanceId: INSTANCE_ID,
          pairAuthorization: PAIR_AUTHORIZATION,
        }
      : { type: 'fvtt-companion-approval', approvalId, status },
  } as MessageEvent<unknown>);
}

describe('CompanionControlClient', () => {
  it('restricts page and browser origins and rejects non-loopback control URLs', async () => {
    const localClient = new CompanionControlClient();
    installBrowser(COMPANION_LOCAL_WEB_ORIGIN);
    expect(localClient.isLocalDevelopmentPage()).toBe(true);
    expect(localClient.isRemotePage()).toBe(false);
    await expect(localClient.health('http://localhost:43173')).rejects.toMatchObject({
      code: 'COMPANION_CONTROL_URL_INVALID',
    });
    await expect(localClient.health('https://127.0.0.1:43173')).rejects.toMatchObject({
      code: 'COMPANION_CONTROL_URL_INVALID',
    });
    await expect(localClient.health('http://127.0.0.1:43173/v2')).rejects.toMatchObject({
      code: 'COMPANION_CONTROL_URL_INVALID',
    });

    const remoteClient = new CompanionControlClient();
    installBrowser(REMOTE_ORIGIN);
    expect(remoteClient.isRemotePage()).toBe(true);
    await expect(remoteClient.health(CONTROL_URL)).rejects.toMatchObject({
      code: 'COMPANION_CONFIRMATION_REQUIRED',
    });

    const firefoxClient = new CompanionControlClient();
    installBrowser(REMOTE_ORIGIN, 'Mozilla/5.0 Firefox/130.0');
    expect(() => firefoxClient.openRemoteConfirmationWindow()).toThrow(/COMPANION_BROWSER_UNSUPPORTED|Companion/);
  });

  it('opens remote confirmation only for HTTPS pages and reports popup blocking', () => {
    const browser = installBrowser(REMOTE_ORIGIN);
    const popup = createPopup();
    (browser.window as unknown as {
      open: (url: string, name?: string, features?: string) => Window;
    }).open = (url, name, features) => {
      browser.openCalls.push([url, name, features]);
      return popup as unknown as Window;
    };
    const client = new CompanionControlClient();

    expect(client.openRemoteConfirmationWindow()).toBe(popup as unknown as Window);
    expect(browser.openCalls).toEqual([
      ['about:blank', 'fvtt-companion-confirmation', 'popup,width=560,height=560'],
    ]);

    installBrowser(REMOTE_ORIGIN);
    expect(() => client.openRemoteConfirmationWindow()).toThrow(/COMPANION_CONFIRMATION_POPUP_BLOCKED|浏览器拦截/);

    installBrowser(COMPANION_LOCAL_WEB_ORIGIN);
    expect(() => client.openRemoteConfirmationWindow()).toThrow(/COMPANION_REMOTE_HTTPS_REQUIRED|远程/);
  });

  it('calls local health, pair, disconnect, and shutdown with the loopback contract', async () => {
    installBrowser(COMPANION_LOCAL_WEB_ORIGIN);
    const calls = queueFetch([HEALTH, PAIR_RESPONSE, ACTION_RESPONSE, ACTION_RESPONSE]);
    const client = new CompanionControlClient();

    await expect(client.health(CONTROL_URL)).resolves.toEqual(HEALTH);
    await expect(client.pair(CONTROL_URL, {
      instanceId: INSTANCE_ID,
      pairingId: 'pairing-1',
      pairingToken: PAIRING_TOKEN,
    })).resolves.toEqual(PAIR_RESPONSE);
    await expect(client.disconnect(CONTROL_URL, INSTANCE_ID, 'control-credential-123456789012345')).resolves.toEqual(ACTION_RESPONSE);
    await expect(client.shutdown(CONTROL_URL, INSTANCE_ID, 'control-credential-123456789012345')).resolves.toEqual(ACTION_RESPONSE);

    expect(pathOf(callAt(calls, 0))).toBe(`${CONTROL_URL}/v2/health`);
    expect(callAt(calls, 0).init?.mode).toBe('cors');
    expect(callAt(calls, 0).init?.credentials).toBe('omit');
    expect(callAt(calls, 0).init?.headers).toEqual({ [COMPANION_CONTROL_HEADER]: '2' });
    expect(pathOf(callAt(calls, 1))).toBe(`${CONTROL_URL}/v2/pair`);
    expect(bodyOf(callAt(calls, 1))).toEqual({
      protocolVersion: 2,
      origin: COMPANION_LOCAL_WEB_ORIGIN,
      instanceId: INSTANCE_ID,
      pairingId: 'pairing-1',
      pairingToken: PAIRING_TOKEN,
    });
    expect(callAt(calls, 1).init?.headers).toMatchObject({
      [COMPANION_CONTROL_HEADER]: '2',
      'content-type': 'application/json',
    });
    expect(pathOf(callAt(calls, 2))).toBe(`${CONTROL_URL}/v2/disconnect`);
    expect(pathOf(callAt(calls, 3))).toBe(`${CONTROL_URL}/v2/shutdown`);
    expect(bodyOf(callAt(calls, 2))).toEqual({
      protocolVersion: 2,
      instanceId: INSTANCE_ID,
      controlCredential: 'control-credential-123456789012345',
    });
    expect((callAt(calls, 1).init as RequestInit & { targetAddressSpace?: string }).targetAddressSpace).toBeUndefined();
    expect(callAt(calls, 0).init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('marks remote pair and action requests for local network access', async () => {
    installBrowser(REMOTE_ORIGIN);
    const calls = queueFetch([PAIR_RESPONSE, ACTION_RESPONSE]);
    const client = new CompanionControlClient();

    await client.pair(CONTROL_URL, {
      instanceId: INSTANCE_ID,
      pairingId: 'pairing-remote',
      pairingToken: PAIRING_TOKEN,
      approvalId: 'approval-12345678901234567890',
      pairAuthorization: PAIR_AUTHORIZATION,
    });
    await client.disconnect(CONTROL_URL, INSTANCE_ID, 'control-credential-123456789012345');

    for (const call of calls) {
      expect((call.init as RequestInit & { targetAddressSpace?: string }).targetAddressSpace).toBe('local');
      expect(call.init?.credentials).toBe('omit');
    }
    expect(bodyOf(callAt(calls, 0))).toMatchObject({
      protocolVersion: 2,
      origin: REMOTE_ORIGIN,
      approvalId: 'approval-12345678901234567890',
      pairAuthorization: PAIR_AUTHORIZATION,
    });
  });

  it('rejects malformed health responses and maps local transport failures', async () => {
    installBrowser(COMPANION_LOCAL_WEB_ORIGIN);
    queueFetch([{ protocolVersion: 999 }]);
    const client = new CompanionControlClient();
    await expect(client.health(CONTROL_URL)).rejects.toMatchObject({
      code: 'COMPANION_PROTOCOL_UNSUPPORTED',
    });

    installBrowser(COMPANION_LOCAL_WEB_ORIGIN);
    installFetch(async () => {
      throw new Error('offline fixture');
    });
    await expect(new CompanionControlClient().health(CONTROL_URL)).rejects.toMatchObject({
      code: 'COMPANION_NOT_DETECTED',
    });
  });

  it('ignores approval messages with the wrong source, origin, or ID and cleans up after approval', async () => {
    const { browser, popup, promise, approvalId } = setupApproval();
    expect(new URL(popup.location.href).searchParams.get('pairingId')).toBe('pairing / id');

    const validMessage = {
      type: 'fvtt-companion-approval',
      approvalId,
      status: 'approved',
      instanceId: INSTANCE_ID,
      pairAuthorization: PAIR_AUTHORIZATION,
    };
    browser.emitMessage({ origin: 'https://evil.example', source: popup, data: validMessage } as MessageEvent<unknown>);
    browser.emitMessage({ origin: CONTROL_URL, source: createPopup(), data: validMessage } as MessageEvent<unknown>);
    browser.emitMessage({
      origin: CONTROL_URL,
      source: popup,
      data: { ...validMessage, approvalId: 'wrong-id' },
    } as MessageEvent<unknown>);
    expect(browser.messageListeners.size).toBe(1);

    browser.emitMessage({ origin: CONTROL_URL, source: popup, data: validMessage } as MessageEvent<unknown>);
    await expect(promise).resolves.toEqual({
      status: 'approved',
      approvalId,
      instanceId: INSTANCE_ID,
      pairAuthorization: PAIR_AUTHORIZATION,
    });
    expect(browser.messageListeners.size).toBe(0);
    expect(browser.timeouts.size).toBe(0);
    expect(browser.intervals.size).toBe(0);
    expect(browser.clearedTimeouts.length).toBeGreaterThan(0);
    expect(browser.clearedIntervals.length).toBeGreaterThan(0);
  });

  it('rejects explicit approval denial and cleans up its listeners', async () => {
    const { browser, popup, promise, approvalId } = setupApproval();
    emitApproval(browser, popup, approvalId, 'rejected');

    await expect(promise).rejects.toMatchObject({ code: 'COMPANION_CONFIRMATION_REJECTED' });
    expect(browser.messageListeners.size).toBe(0);
    expect(browser.timeouts.size).toBe(0);
    expect(browser.intervals.size).toBe(0);
  });

  it('rejects when the confirmation popup closes or the approval expires', async () => {
    const closed = setupApproval();
    closed.popup.closed = true;
    closed.browser.runNextInterval();
    await expect(closed.promise).rejects.toMatchObject({ code: 'COMPANION_CONFIRMATION_WINDOW_CLOSED' });
    expect(closed.browser.messageListeners.size).toBe(0);
    expect(closed.browser.timeouts.size).toBe(0);
    expect(closed.browser.intervals.size).toBe(0);

    const expired = setupApproval();
    expired.browser.runNextTimeout();
    await expect(expired.promise).rejects.toMatchObject({ code: 'COMPANION_APPROVAL_EXPIRED' });
    expect(expired.browser.messageListeners.size).toBe(0);
    expect(expired.browser.timeouts.size).toBe(0);
    expect(expired.browser.intervals.size).toBe(0);
  });
});
