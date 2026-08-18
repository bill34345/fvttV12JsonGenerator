import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  COMPANION_CONTROL_HEADER,
  COMPANION_CONTROL_PROTOCOL_VERSION,
  COMPANION_CONTROL_URL,
  COMPANION_SERVICE_NAME,
  isCompanionLocalDevOrigin,
  isCompanionRemoteOrigin,
  isCompanionWebOrigin,
  isOpaqueCredential,
  isSafeId,
  type LocalCompanionActionResponse,
  type LocalCompanionApprovalMessage,
  type LocalCompanionHealth,
  type LocalCompanionInstanceRequest,
  type LocalCompanionPairRequest,
  type LocalCompanionPairResponse,
  type LocalCompanionState,
  type RemoteApprovalStatus,
} from './controlProtocol';

const MAX_CONTROL_BODY_BYTES = 16 * 1024;
const PAIR_RATE_WINDOW_MS = 60 * 1_000;
const PAIR_RATE_LIMIT = 10;
const AUTHORIZATION_TTL_MS = 5 * 60 * 1_000;

export interface CompanionControlSocket {
  close(code?: number, reason?: string): void;
}

export interface CompanionRunInput {
  origin: string;
  pairingId: string;
  pairingToken: string;
}

export interface CompanionRunCallbacks {
  onState?: (state: LocalCompanionState) => void;
  onSocket?: (socket: CompanionControlSocket) => void;
}

export interface CompanionControlServiceOptions {
  startRun: (input: CompanionRunInput, callbacks: CompanionRunCallbacks) => Promise<void>;
  instanceId?: string;
  version?: string;
  now?: () => number;
  onStateChange?: (state: LocalCompanionState) => void;
  onShutdown?: () => void;
}

export interface CompanionControlService {
  fetch(request: Request): Promise<Response>;
  health(): LocalCompanionHealth;
  isBusy(): boolean;
}

interface RemoteApprovalRecord {
  id: string;
  origin: string;
  pairingId: string;
  instanceId: string;
  status: Exclude<RemoteApprovalStatus, 'expired'>;
  expiresAt: number;
  pairAuthorizationHash?: string;
  consumed: boolean;
}

interface ControlCredentialRecord {
  origin: string;
  instanceId: string;
  expiresAt: number;
  credentialHash: string;
  consumed: boolean;
}

/**
 * The loopback control plane deliberately does not know any Codex/OAuth
 * credential. It only brokers one local, user-confirmed pairing at a time.
 */
export function createCompanionControlService(
  options: CompanionControlServiceOptions,
): CompanionControlService {
  const now = options.now ?? Date.now;
  const instanceId = options.instanceId ?? randomBytes(18).toString('base64url');
  const version = options.version ?? '1.0.0';
  const approvals = new Map<string, RemoteApprovalRecord>();
  const controlCredentials = new Map<string, ControlCredentialRecord>();
  const pairAttempts: number[] = [];
  let state: LocalCompanionState = 'idle';
  let diagnostic: string | undefined;
  let activeSocket: CompanionControlSocket | undefined;
  let activeRun: Promise<void> | undefined;
  let stopped = false;

  const setState = (nextState: LocalCompanionState, nextDiagnostic?: string) => {
    state = nextState;
    diagnostic = nextDiagnostic;
    options.onStateChange?.(state);
  };

  const health = (): LocalCompanionHealth => ({
    protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
    service: COMPANION_SERVICE_NAME,
    version,
    instanceId,
    status: state,
    ...(diagnostic ? { diagnostic } : {}),
  });

  const service: CompanionControlService = {
    health,
    isBusy: () => Boolean(activeRun) || state === 'connecting' || state === 'verifying' || state === 'connected',
    async fetch(request) {
      cleanupExpired();
      const url = new URL(request.url);
      const origin = request.headers.get('origin');

      if (request.method === 'GET' && url.pathname === '/v2/approve') {
        return renderApprovalPage(url);
      }
      if (request.method === 'POST' && url.pathname === '/v2/approve') {
        return submitApproval(request);
      }
      if (request.method === 'OPTIONS') {
        return controlPreflight(origin);
      }
      if (request.headers.get(COMPANION_CONTROL_HEADER) !== String(COMPANION_CONTROL_PROTOCOL_VERSION)) {
        return controlError(origin, 400, 'COMPANION_PROTOCOL_UNSUPPORTED', 'Companion 控制协议版本不受支持。');
      }
      if (!origin || !isCompanionWebOrigin(origin)) {
        return controlError(origin, 403, 'COMPANION_ORIGIN_REJECTED', '当前网页地址不能控制本机 Companion。');
      }

      if (request.method === 'GET' && url.pathname === '/v2/health') {
        if (!isCompanionLocalDevOrigin(origin)) {
          return controlError(origin, 403, 'COMPANION_CONFIRMATION_REQUIRED', '远程网页必须先打开本机确认页并获得授权，不能直接读取 Companion。');
        }
        return controlJson(origin, health());
      }

      if (request.method !== 'POST') {
        return controlError(origin, 405, 'COMPANION_METHOD_NOT_ALLOWED', '只允许文档中列出的 Companion 控制请求。');
      }
      let body: unknown;
      try {
        body = await readControlBody(request);
      } catch {
        return controlError(origin, 400, 'COMPANION_INVALID_CONTROL_BODY', 'Companion 控制请求内容无效或过大。');
      }

      if (url.pathname === '/v2/pair') {
        return beginPairing(origin, body);
      }
      if (url.pathname === '/v2/disconnect') {
        return runAction(origin, body, 'disconnect');
      }
      if (url.pathname === '/v2/shutdown') {
        return runAction(origin, body, 'shutdown');
      }
      return controlError(origin, 404, 'COMPANION_ROUTE_NOT_FOUND', '未找到 Companion 控制路径。');
    },
  };

  function renderApprovalPage(url: URL): Response {
    const origin = url.searchParams.get('origin') ?? '';
    const approvalId = url.searchParams.get('approvalId') ?? '';
    const pairingId = url.searchParams.get('pairingId') ?? '';
    if (!isCompanionRemoteOrigin(origin) || !isSafeId(approvalId, 24) || !isSafeId(pairingId, 24)) {
      return approvalHtml(400, '无法打开确认页', '确认链接无效。请回到网页重新点击连接。');
    }
    const existing = approvals.get(approvalId);
    if (existing && (existing.origin !== origin || existing.pairingId !== pairingId || existing.instanceId !== instanceId)) {
      return approvalHtml(409, '确认链接不能复用', '这个确认链接已绑定到其他网页或配对，请回到网页重新开始。');
    }
    if (!existing) {
      approvals.set(approvalId, {
        id: approvalId,
        origin,
        pairingId,
        instanceId,
        status: 'pending',
        expiresAt: now() + AUTHORIZATION_TTL_MS,
        consumed: false,
      });
    }
    const approval = approvals.get(approvalId)!;
    return approvalForm(approval);
  }

  async function submitApproval(request: Request): Promise<Response> {
    if (request.headers.get('origin') !== COMPANION_CONTROL_URL) {
      return approvalHtml(403, '确认失败', '只有本机确认页面中的按钮可以批准这次连接。');
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return approvalHtml(400, '确认失败', '确认内容无法读取。请关闭此页面后重新连接。');
    }
    const approvalId = String(form.get('approvalId') ?? '');
    const action = String(form.get('action') ?? '');
    const approval = approvals.get(approvalId);
    if (!approval || approval.expiresAt <= now()) {
      if (approval) approval.status = 'rejected';
      return approvalHtml(410, '确认已过期', '这次授权已过期。请关闭此页面，回到网页重新点击连接。');
    }
    if (action === 'approve') {
      approval.status = 'approved';
      approval.expiresAt = now() + AUTHORIZATION_TTL_MS;
      const pairAuthorization = randomBytes(32).toString('base64url');
      approval.pairAuthorizationHash = hashCredential(pairAuthorization);
      return approvalCompletionPage(
        approval,
        '已允许本次连接',
        `已允许 ${approval.origin} 在五分钟内仅为这一次配对连接本机 Companion。现在可关闭此页面并回到网页。`,
        pairAuthorization,
      );
    }
    approval.status = 'rejected';
    approval.pairAuthorizationHash = undefined;
    return approvalCompletionPage(
      approval,
      '已拒绝本次连接',
      '本机 Companion 没有向该网页开放控制权限。你可以关闭此页面。',
    );
  }

  function beginPairing(origin: string, body: unknown): Response {
    if (!consumePairRateLimit(pairAttempts, now)) {
      return controlError(origin, 429, 'COMPANION_RATE_LIMITED', '本机 Companion 配对请求过于频繁，请稍后再试。');
    }
    const input = parsePairRequest(body, instanceId);
    if (!input || input.origin !== origin) {
      return controlError(origin, 400, 'COMPANION_INVALID_PAIR_REQUEST', 'Companion 配对请求格式无效。');
    }
    if (service.isBusy()) {
      return controlError(origin, 409, 'COMPANION_BUSY', '本机 Companion 已连接到另一个网页会话。');
    }
    if (isCompanionRemoteOrigin(origin)) {
      if (!consumeRemoteApproval(input, origin)) {
        return controlError(origin, 403, 'COMPANION_CONFIRMATION_REQUIRED', '请先在本机确认页确认这个远程网站，然后重新连接。');
      }
    } else if (!isCompanionLocalDevOrigin(origin) || input.approvalId || input.pairAuthorization) {
      return controlError(origin, 403, 'COMPANION_ORIGIN_REJECTED', '本地开发连接不接受远程授权字段。');
    }

    const controlCredential = issueControlCredential(origin);
    setState('connecting');
    const run = options.startRun({
      origin: input.origin,
      pairingId: input.pairingId,
      pairingToken: input.pairingToken,
    }, {
      onState: (nextState) => setState(nextState),
      onSocket: (socket) => { activeSocket = socket; },
    });
    activeRun = run;
    void run.catch((error) => {
      setState('blocked', sanitizeDiagnostic(error));
    }).finally(() => {
      activeSocket = undefined;
      activeRun = undefined;
      if (!stopped && state !== 'blocked') setState('idle');
    });
    return controlJson<LocalCompanionPairResponse>(origin, {
      accepted: true,
      instanceId,
      status: 'connecting',
      controlCredential,
    });
  }

  function runAction(origin: string, body: unknown, action: 'disconnect' | 'shutdown'): Response {
    const input = parseActionRequest(body, instanceId);
    if (!input || !consumeControlCredential(input, origin)) {
      return controlError(origin, 403, 'COMPANION_CONTROL_CREDENTIAL_REQUIRED', '这次本机操作需要一个尚未使用的配对控制凭据。请重新配对后再试。');
    }
    activeSocket?.close(1000, action === 'disconnect' ? 'Disconnected by the Web page.' : 'Companion stopped by the Web page.');
    if (action === 'disconnect') {
      setState('idle');
      return controlJson<LocalCompanionActionResponse>(origin, { accepted: true, instanceId, status: 'idle' }, true);
    }
    stopped = true;
    setState('idle');
    const response = controlJson<LocalCompanionActionResponse>(origin, { accepted: true, instanceId, status: 'idle' }, true);
    setTimeout(() => options.onShutdown?.(), 25);
    return response;
  }

  function consumeRemoteApproval(input: LocalCompanionPairRequest, origin: string): boolean {
    if (!input.approvalId || !input.pairAuthorization) return false;
    const approval = approvals.get(input.approvalId);
    if (!approval
      || approval.status !== 'approved'
      || approval.expiresAt <= now()
      || approval.consumed
      || approval.origin !== origin
      || approval.instanceId !== instanceId
      || approval.pairingId !== input.pairingId
      || !approval.pairAuthorizationHash
      || !matchesCredential(approval.pairAuthorizationHash, input.pairAuthorization)) {
      return false;
    }
    approval.consumed = true;
    return true;
  }

  function issueControlCredential(origin: string): string {
    const credential = randomBytes(32).toString('base64url');
    controlCredentials.set(credentialId(credential), {
      origin,
      instanceId,
      expiresAt: now() + AUTHORIZATION_TTL_MS,
      credentialHash: hashCredential(credential),
      consumed: false,
    });
    return credential;
  }

  function consumeControlCredential(input: LocalCompanionInstanceRequest, origin: string): boolean {
    const record = controlCredentials.get(credentialId(input.controlCredential));
    if (!record
      || record.consumed
      || record.expiresAt <= now()
      || record.origin !== origin
      || record.instanceId !== input.instanceId
      || !matchesCredential(record.credentialHash, input.controlCredential)) {
      return false;
    }
    record.consumed = true;
    return true;
  }

  function controlPreflight(origin: string | null): Response {
    if (!origin || !isCorsEligible(origin)) {
      return controlError(origin, 403, 'COMPANION_ORIGIN_REJECTED', '当前网页尚未获得本机 Companion 授权。');
    }
    return new Response(null, { status: 204, headers: controlHeaders(origin) });
  }

  function isCorsEligible(origin: string): boolean {
    if (isCompanionLocalDevOrigin(origin)) return true;
    if (!isCompanionRemoteOrigin(origin)) return false;
    return [...approvals.values()].some((approval) => approval.origin === origin
        && approval.status === 'approved'
        && approval.expiresAt > now()
        && !approval.consumed)
      || [...controlCredentials.values()].some((credential) => credential.origin === origin && credential.expiresAt > now() && !credential.consumed);
  }

  function controlJson<T>(origin: string | null, value: T, forceCors = false): Response {
    return new Response(JSON.stringify(value), {
      headers: {
        ...(origin && (forceCors || isCorsEligible(origin)) ? controlHeaders(origin) : noStoreHeaders()),
        'content-type': 'application/json; charset=utf-8',
      },
    });
  }

  function controlError(origin: string | null, status: number, code: string, message: string): Response {
    return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
      status,
      headers: {
        ...(origin && isCorsEligible(origin) ? controlHeaders(origin) : noStoreHeaders()),
        'content-type': 'application/json; charset=utf-8',
      },
    });
  }

  function cleanupExpired(): void {
    for (const [id, approval] of approvals) {
      if (approval.expiresAt <= now()) approvals.delete(id);
    }
    for (const [id, credential] of controlCredentials) {
      if (credential.expiresAt <= now()) controlCredentials.delete(id);
    }
  }

  return service;
}

function parsePairRequest(value: unknown, instanceId: string): LocalCompanionPairRequest | undefined {
  if (!isRecord(value) || value.protocolVersion !== COMPANION_CONTROL_PROTOCOL_VERSION
    || value.instanceId !== instanceId
    || !isCompanionWebOrigin(String(value.origin ?? ''))
    || !isSafeId(value.pairingId, 24)
    || !isSafeId(value.pairingToken, 32)) return undefined;
  const approvalId = value.approvalId;
  const pairAuthorization = value.pairAuthorization;
  if ((approvalId === undefined) !== (pairAuthorization === undefined)) return undefined;
  if (approvalId !== undefined && (!isSafeId(approvalId, 24) || !isOpaqueCredential(pairAuthorization))) return undefined;
  return {
    protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
    instanceId,
    origin: String(value.origin),
    pairingId: value.pairingId,
    pairingToken: value.pairingToken,
    ...(approvalId !== undefined ? { approvalId, pairAuthorization: pairAuthorization as string } : {}),
  };
}

function parseActionRequest(value: unknown, instanceId: string): LocalCompanionInstanceRequest | undefined {
  if (!isRecord(value)
    || value.protocolVersion !== COMPANION_CONTROL_PROTOCOL_VERSION
    || value.instanceId !== instanceId
    || !isOpaqueCredential(value.controlCredential)) return undefined;
  return {
    protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
    instanceId,
    controlCredential: value.controlCredential,
  };
}

async function readControlBody(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAX_CONTROL_BODY_BYTES)) {
    throw new Error('control body too large');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_CONTROL_BODY_BYTES) throw new Error('control body too large');
  return text.trim() ? JSON.parse(text) as unknown : undefined;
}

function controlHeaders(origin: string): HeadersInit {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': `content-type, ${COMPANION_CONTROL_HEADER}`,
    'access-control-allow-private-network': 'true',
    'cache-control': 'no-store',
    vary: 'Origin',
  };
}

function noStoreHeaders(): HeadersInit {
  return { 'cache-control': 'no-store', vary: 'Origin' };
}

function approvalForm(approval: RemoteApprovalRecord): Response {
  const title = approval.status === 'pending' ? '允许这个网页连接本机 Companion？' : approval.status === 'approved' ? '此网页已获准' : '此网页已被拒绝';
  const body = approval.status === 'pending'
    ? `<p>网页地址：</p><pre>${escapeHtml(approval.origin)}</pre><p>仅允许它在五分钟内完成<strong>这一次</strong>配对。它不能读取你的 Codex 登录信息，也不能控制其他程序。</p><form method="post" action="/v2/approve"><input type="hidden" name="approvalId" value="${escapeHtml(approval.id)}"><button name="action" value="approve" type="submit">允许这一次连接</button><button name="action" value="reject" type="submit">拒绝</button></form>`
    : `<p>网页地址：</p><pre>${escapeHtml(approval.origin)}</pre><p>${approval.status === 'approved' ? '你已经确认过这次连接。回到网页继续即可。' : '你已经拒绝这次连接。'}</p>`;
  return approvalHtml(200, title, body, true);
}

function approvalCompletionPage(
  approval: RemoteApprovalRecord,
  title: string,
  message: string,
  pairAuthorization?: string,
): Response {
  if (approval.status === 'pending') {
    return approvalHtml(409, '确认尚未完成', '请先在本机页面选择允许或拒绝。');
  }
  const signal: LocalCompanionApprovalMessage = {
    type: 'fvtt-companion-approval' as const,
    approvalId: approval.id,
    status: approval.status,
    ...(pairAuthorization
      ? { instanceId: approval.instanceId, pairAuthorization }
      : {}),
  };
  const script = `<script>if(window.opener&&!window.opener.closed){window.opener.postMessage(${jsonForInlineScript(signal)},${jsonForInlineScript(approval.origin)});}</script>`;
  return approvalHtml(200, title, `${message}${script}`, true);
}

function approvalHtml(status: number, title: string, body: string, trustedHtml = false): Response {
  const content = trustedHtml ? body : `<p>${escapeHtml(body)}</p>`;
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1.25rem;color:#202124}pre{overflow-wrap:anywhere;background:#f4f4f5;padding:1rem;border-radius:.5rem}button{margin:0 .5rem .5rem 0;padding:.7rem 1rem;font:inherit}button[value=approve]{background:#0f766e;color:white;border:0;border-radius:.4rem}button[value=reject]{background:white;border:1px solid #9ca3af;border-radius:.4rem}</style><h1>${escapeHtml(title)}</h1>${content}</html>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function consumePairRateLimit(attempts: number[], now: () => number): boolean {
  const cutoff = now() - PAIR_RATE_WINDOW_MS;
  while (attempts[0] !== undefined && attempts[0]! < cutoff) attempts.shift();
  if (attempts.length >= PAIR_RATE_LIMIT) return false;
  attempts.push(now());
  return true;
}

function credentialId(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 24);
}

function hashCredential(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function matchesCredential(expectedHash: string, value: string): boolean {
  const expected = Buffer.from(expectedHash, 'utf8');
  const actual = Buffer.from(hashCredential(value), 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sanitizeDiagnostic(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value
    .trim()
    .slice(0, 500)
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, 'Bearer [redacted]')
    .replace(/(?:api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/giu, '$1=[redacted]');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function jsonForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</gu, '\\u003c')
    .replace(/>/gu, '\\u003e')
    .replace(/&/gu, '\\u0026')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
