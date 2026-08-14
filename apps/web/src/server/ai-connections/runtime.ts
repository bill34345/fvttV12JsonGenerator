import { createHmac, randomBytes } from 'node:crypto';
import { loadMonsterIntakeConfig } from '@fvtt-json-generator/intake-ai';

import {
  COMPANION_CONTROL_PROTOCOL_VERSION,
  COMPANION_CONTROL_URL,
} from '../../companion/controlProtocol';
import type { WebJobRunnerDependencies } from '../jobs/jobRunner';
import type { WebAiConnectionsConfig } from '../security/config';
import { getCompanionArtifactInfo } from './artifact';
import { CompanionHub, type CompanionSocket } from './companionHub';
import { CodexPairingRegistry, type CodexPairingCreated, type CodexPairingPublic } from './pairing';
import { decodeCompanionMessage, isCompanionPair, type CompanionGateResultMessage } from './protocol';
import { createIntakeProvidersForConnection } from './providers';
import { AiConnectionRegistry } from './registry';
import { SiteAiQuota, type SiteAiQuotaLease } from './quota';
import { assertAllowedProviderBaseUrl, assertStateChangingRequest, DEFAULT_PROVIDER_BASE_URL, requestOrigin } from './security';
import { createAnonymousSessionManager, type AnonymousSession, type AnonymousSessionManager } from './session';
import { AiConnectionError, type AiConnection, type ByokConnectionInput, type ResolvedAiConnection } from './types';

export interface AiConnectionsRuntimeOptions {
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  env?: Record<string, string | undefined>;
  now?: () => number;
  companionHub?: CompanionHub;
  pairings?: CodexPairingRegistry;
  artifact?: AiConnectionsOverview['companion']['artifact'];
}

export interface AiConnectionsOverview {
  connections: AiConnection[];
  csrfToken: string;
  siteAvailable: boolean;
  companion: {
    available: boolean;
    platform: 'windows';
    defaultModel: 'gpt-5.6-luna';
    defaultReasoningEffort: 'xhigh';
    diagnostic?: string;
    artifact: {
      available: boolean;
      fileName: string;
      downloadUrl: string | null;
      sha256: string | null;
    };
    controlUrl: string;
    controlProtocolVersion: 1;
  };
  sessionExpiresAt: string;
}

export interface AuthorizedAiConnection {
  session: AnonymousSession;
  connection: ResolvedAiConnection;
  sessionBinding: string;
  quotaLease?: SiteAiQuotaLease;
}

export interface AiConnectionsRuntime {
  handleApiRequest(request: Request, clientIp: string, maxBodyBytes: number): Promise<Response | null>;
  authorize(request: Request, connectionId: string, clientIp: string): AuthorizedAiConnection;
  createProviders(connection: ResolvedAiConnection): WebJobRunnerDependencies;
  matchesSession(request: Request, sessionBinding: string): boolean;
  resolveSession(request: Request): { session: AnonymousSession; setCookie?: string };
  registry: AiConnectionRegistry;
  companion: {
    createPairing(request: Request, sessionId: string, settings: { model: string; reviewModel: string; reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' }): CodexPairingCreated;
    getPairing(sessionId: string, pairingId: string): CodexPairingPublic | undefined;
    cancelPairing(sessionId: string, pairingId: string): boolean;
    createPending(request: Request): { pendingId: string } | undefined;
    acceptPending(pendingId: string, raw: string | ArrayBuffer | Uint8Array): { connectionId: string; pairingId: string } | undefined;
    cancelPending(pendingId: string): void;
    open(connectionId: string, socket: CompanionSocket): void;
    message(connectionId: string, raw: string | ArrayBuffer | Uint8Array): void;
    close(connectionId: string): void;
    abort(connectionId: string): void;
    isOnline(connectionId: string): boolean;
  };
}

export function createAiConnectionsRuntime(
  config: WebAiConnectionsConfig,
  options: AiConnectionsRuntimeOptions = {},
): AiConnectionsRuntime {
  const now = options.now ?? Date.now;
  const env = options.env ?? Bun.env;
  const fetcher = options.fetcher ?? fetch;
  const sessions: AnonymousSessionManager = createAnonymousSessionManager({
    secret: config.sessionSecret,
    secure: config.secureCookies,
    publicMode: config.secureCookies,
    idleTtlMs: config.idleTtlMs,
    absoluteTtlMs: config.absoluteTtlMs,
    now,
  });
  const registry = new AiConnectionRegistry({
    idleTtlMs: config.idleTtlMs,
    absoluteTtlMs: config.absoluteTtlMs,
    now,
  });
  const quota = new SiteAiQuota(config.site, now);
  const companionHub = options.companionHub ?? new CompanionHub({ now });
  const pairings = options.pairings ?? new CodexPairingRegistry({ now });
  const artifact = options.artifact ?? getCompanionArtifactInfo();
  const activeSessionIds = new Set<string>();
  const pendingCompanions = new Map<string, { expectedOrigin: string }>();

  return {
    registry,
    companion: {
      createPairing(request, sessionId, settings) {
        activeSessionIds.add(sessionId);
        return pairings.create(sessionId, requestOrigin(request, config.secureCookies), settings);
      },
      getPairing(sessionId, pairingId) {
        return pairings.get(sessionId, pairingId);
      },
      cancelPairing(sessionId, pairingId) {
        return pairings.cancel(sessionId, pairingId);
      },
      createPending(request) {
        if (!config.companionEnabled) return undefined;
        const url = new URL(request.url);
        if (url.pathname !== '/api/ai-companion/connect') return undefined;
        const expectedOrigin = requestOrigin(request, config.secureCookies);
        const websocketOrigin = request.headers.get('origin');
        if (websocketOrigin && websocketOrigin !== 'null' && websocketOrigin !== expectedOrigin) return undefined;
        const pendingId = randomBytes(18).toString('base64url');
        pendingCompanions.set(pendingId, { expectedOrigin });
        return { pendingId };
      },
      acceptPending(pendingId, raw) {
        const pending = pendingCompanions.get(pendingId);
        if (!pending) return undefined;
        pendingCompanions.delete(pendingId);
        let value: unknown;
        try {
          value = decodeCompanionMessage(raw);
        } catch {
          return undefined;
        }
        if (!isCompanionPair(value) || value.origin !== pending.expectedOrigin) return undefined;
        return acceptPairing(value.pairingId, value.token, value.origin, pending.expectedOrigin);
      },
      cancelPending(pendingId) {
        pendingCompanions.delete(pendingId);
      },
      open(connectionId, socket) {
        const connection = findConnection(connectionId);
        if (!connection) {
          socket.close(1008, 'Companion connection is not registered.');
          return;
        }
        const models = [
          { model: connection.model, reasoningEffort: connection.reasoningEffort },
          ...(connection.reviewModel === connection.model
            ? []
            : [{ model: connection.reviewModel, reasoningEffort: connection.reasoningEffort }]),
        ];
        companionHub.open(connectionId, socket, models);
      },
      message(connectionId, raw) {
        const gateResult = companionHub.message(connectionId, raw);
        if (gateResult) completeGate(connectionId, gateResult);
      },
      close(connectionId) {
        companionHub.close(connectionId);
        const connection = findConnection(connectionId);
        if (!connection) return;
        if (connection.status !== 'blocked') {
          registry.updateStatus(connection.sessionId, connection.id, 'offline', 'Companion WebSocket 已断开；请确认 Companion 仍在运行，并检查 origin 与反向代理 WebSocket 配置。');
        }
        if (connection.companionId) {
          const pairing = connection.pairingId
            ? pairings.get(connection.sessionId, connection.pairingId)
            : undefined;
          if (pairing) pairings.markDisconnected(pairing.id, 'Companion WebSocket 已断开；请确认 Companion 仍在运行，并检查 origin 与反向代理 WebSocket 配置。');
        }
      },
      abort(connectionId) {
        companionHub.abort(connectionId);
        const connection = findConnection(connectionId);
        if (connection) {
          if (connection.companionId) {
            const pairing = connection.pairingId
              ? pairings.get(connection.sessionId, connection.pairingId)
              : undefined;
            if (pairing) pairings.markDisconnected(pairing.id);
          }
          registry.delete(connection.sessionId, connection.id);
        }
      },
      isOnline(connectionId) {
        return companionHub.isOnline(connectionId);
      },
    },
    resolveSession(request) {
      cleanupState();
      const resolved = sessions.resolve(request);
      activeSessionIds.add(resolved.session.id);
      return resolved;
    },
    matchesSession(request, sessionBinding) {
      cleanupState();
      return sessionBindingFor(sessions.resolve(request).session.id) === sessionBinding;
    },
    authorize(request, connectionId, clientIp) {
      cleanupState();
      const resolved = sessions.resolve(request);
      activeSessionIds.add(resolved.session.id);
      assertStateChangingRequest(request, resolved.session.csrfToken, requestOrigin(request, config.secureCookies));
      const connection = registry.resolveForProvider(resolved.session.id, connectionId);
      if (connection.kind === 'local-codex' && (connection.status !== 'ready' || !connection.companionId || !companionHub.isOnline(connection.companionId))) {
        registry.updateStatus(resolved.session.id, connection.id, 'offline', 'Companion is offline.');
        throw new AiConnectionError('AI_CONNECTION_NOT_READY', 'Local Codex Companion is offline.');
      }
      const quotaLease = connection.kind === 'site' ? quota.acquire(resolved.session.id, clientIp) : undefined;
      return {
        session: resolved.session,
        connection,
        sessionBinding: sessionBindingFor(resolved.session.id),
        ...(quotaLease ? { quotaLease } : {}),
      };
    },
    createProviders(connection) {
      return createIntakeProvidersForConnection(connection, {
        env,
        fetcher,
        ...(connection.kind === 'local-codex' && connection.companionId
          ? { companion: companionHub.request(connection.companionId) }
          : {}),
      });
    },
    async handleApiRequest(request, clientIp, maxBodyBytes) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/ai-connections')) return null;
      cleanupState();
      const resolved = sessions.resolve(request);
      activeSessionIds.add(resolved.session.id);
      try {
        if (request.method === 'GET' && url.pathname === '/api/ai-connections') {
          return withCookie(jsonSuccess(overview(resolved.session)), resolved.setCookie);
        }
        if (request.method === 'POST' && url.pathname === '/api/ai-connections/site') {
          assertStateChangingRequest(request, resolved.session.csrfToken, requestOrigin(request, config.secureCookies));
          if (!config.site.enabled) throw apiError(403, 'SITE_AI_DISABLED', '站点 AI 未启用，请使用自己的 API Key。');
          const site = loadSiteSettings(env);
          const connection = registry.createSite(resolved.session.id, site);
          return withCookie(jsonSuccess(connection), resolved.setCookie);
        }
        if (request.method === 'POST' && url.pathname === '/api/ai-connections/byok') {
          assertStateChangingRequest(request, resolved.session.csrfToken, requestOrigin(request, config.secureCookies));
          const body = await readJsonBody<Partial<ByokConnectionInput>>(request, maxBodyBytes);
          const baseUrl = assertAllowedProviderBaseUrl(
            requiredString(body.baseUrl ?? DEFAULT_PROVIDER_BASE_URL, 'baseUrl', 2_048),
            config.allowedProviderOrigins,
          );
          const connection = registry.createByok(resolved.session.id, {
            apiKey: requiredString(body.apiKey, 'apiKey', 8_192),
            baseUrl,
            model: requiredString(body.model, 'model', 256),
            reviewModel: optionalString(body.reviewModel, 256) ?? requiredString(body.model, 'model', 256),
            reasoningEffort: reasoningEffort(body.reasoningEffort),
          });
          return withCookie(jsonSuccess(connection), resolved.setCookie);
        }

        if (request.method === 'POST' && url.pathname === '/api/ai-connections/codex/pairings') {
          assertStateChangingRequest(request, resolved.session.csrfToken, requestOrigin(request, config.secureCookies));
          if (!config.companionEnabled) {
            throw apiError(503, 'COMPANION_BLOCKED', 'Local Codex Companion is disabled until the official CLI zero-tool gate passes.');
          }
          const body = await readJsonBody<Partial<{ model: string; reviewModel: string; reasoningEffort: string }>>(request, maxBodyBytes);
          const model = optionalString(body.model, 256) ?? 'gpt-5.6-luna';
          const reviewModel = optionalString(body.reviewModel, 256) ?? model;
          const pairing = pairings.create(resolved.session.id, requestOrigin(request, config.secureCookies), {
            model,
            reviewModel,
            reasoningEffort: reasoningEffort(body.reasoningEffort ?? 'xhigh'),
          });
          return withCookie(jsonSuccess(pairing), resolved.setCookie);
        }

        const pairingMatch = url.pathname.match(/^\/api\/ai-connections\/codex\/pairings\/([A-Za-z0-9_-]{24,})$/);
        if (request.method === 'DELETE' && pairingMatch?.[1]) {
          assertStateChangingRequest(request, resolved.session.csrfToken, requestOrigin(request, config.secureCookies));
          if (!pairings.cancel(resolved.session.id, pairingMatch[1])) {
            throw apiError(409, 'CODEX_PAIRING_NOT_CANCELLABLE', 'Codex pairing is no longer pending.');
          }
          return withCookie(jsonSuccess({ cancelled: true }), resolved.setCookie);
        }
        if (request.method === 'GET' && pairingMatch?.[1]) {
          const pairing = pairings.get(resolved.session.id, pairingMatch[1]);
          if (!pairing) throw apiError(404, 'CODEX_PAIRING_NOT_FOUND', 'Codex pairing was not found for this session.');
          return withCookie(jsonSuccess(pairing), resolved.setCookie);
        }

        const testMatch = url.pathname.match(/^\/api\/ai-connections\/([A-Za-z0-9_-]{32,})\/test$/);
        if (request.method === 'POST' && testMatch?.[1]) {
          assertStateChangingRequest(request, resolved.session.csrfToken, requestOrigin(request, config.secureCookies));
          const connection = registry.resolveForProvider(resolved.session.id, testMatch[1]);
          const result = await testConnection(connection);
          return withCookie(jsonSuccess(result), resolved.setCookie);
        }

        const deleteMatch = url.pathname.match(/^\/api\/ai-connections\/([A-Za-z0-9_-]{32,})$/);
        if (request.method === 'DELETE' && deleteMatch?.[1]) {
          assertStateChangingRequest(request, resolved.session.csrfToken, requestOrigin(request, config.secureCookies));
          let connection: ResolvedAiConnection;
          try {
            connection = registry.resolveForCompanion(resolved.session.id, deleteMatch[1]);
          } catch {
            throw apiError(404, 'AI_CONNECTION_NOT_FOUND', 'AI connection was not found for this session.');
          }
          if (connection.kind === 'local-codex' && connection.companionId) {
            companionHub.abort(connection.companionId);
            const pairing = connection.pairingId
              ? pairings.get(resolved.session.id, connection.pairingId)
              : undefined;
            if (pairing) pairings.markDisconnected(pairing.id);
            registry.delete(resolved.session.id, connection.id);
          } else {
            registry.delete(resolved.session.id, connection.id);
          }
          return withCookie(jsonSuccess({ disconnected: true }), resolved.setCookie);
        }

        return withCookie(jsonFailure(404, 'AI_CONNECTION_ROUTE_NOT_FOUND', 'AI connection route not found.'), resolved.setCookie);
      } catch (error) {
        return withCookie(errorResponse(error), resolved.setCookie);
      }

      function overview(session: AnonymousSession): AiConnectionsOverview {
        return {
          connections: registry.list(session.id),
          csrfToken: session.csrfToken,
          siteAvailable: config.site.enabled,
          companion: {
            available: config.companionEnabled,
            platform: 'windows',
            defaultModel: 'gpt-5.6-luna',
            defaultReasoningEffort: 'xhigh',
            diagnostic: config.companionEnabled
              ? '请下载并运行本机 Companion；它会使用已登录的官方 Codex CLI，并先通过零工具安全门禁。'
              : 'Companion 端点未启用；本地开发可由 web:dev 默认开启，生产环境需要操作者显式配置。',
            artifact,
            controlUrl: COMPANION_CONTROL_URL,
            controlProtocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
          },
          sessionExpiresAt: new Date(session.absoluteExpiresAt).toISOString(),
        };
      }

      async function testConnection(connection: ResolvedAiConnection) {
        if (connection.kind === 'local-codex') {
          if (!connection.companionId || !companionHub.isOnline(connection.companionId)) {
            throw apiError(409, 'LOCAL_CODEX_NOT_READY', connection.diagnostic ?? 'Local Codex Companion is offline.');
          }
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 30_000);
          try {
            const response = await companionHub.request(connection.companionId)('/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: connection.model,
                reasoning_effort: connection.reasoningEffort,
                messages: [
                  { role: 'system', content: 'Return only a JSON object with ok=true. Never use tools.' },
                  { role: 'user', content: 'Connection test.' },
                ],
              }),
              signal: controller.signal,
            });
            if (!response.ok) throw apiError(502, 'AI_CONNECTION_TEST_FAILED', 'Companion model test failed.');
            const envelope = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
            if (typeof envelope.choices?.[0]?.message?.content !== 'string') {
              throw apiError(502, 'AI_CONNECTION_TEST_FAILED', 'Companion returned no model content.');
            }
          } catch (error) {
            if (error instanceof AiApiError) throw error;
            throw apiError(502, 'AI_CONNECTION_TEST_FAILED', 'Companion model test failed.');
          } finally {
            clearTimeout(timer);
          }
          return { ok: true, model: connection.model, testedAt: new Date(now()).toISOString() };
        }
        const provider = connection.kind === 'site'
          ? { ...loadSiteSettings(env), ...loadMonsterIntakeConfig(env) }
          : connection;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15_000);
        try {
          const response = await fetcher(`${requiredString(provider.baseUrl, 'baseUrl').replace(/\/+$/, '')}/models`, {
            method: 'GET',
            headers: { authorization: `Bearer ${requiredString(provider.apiKey, 'apiKey')}` },
            redirect: 'error',
            signal: controller.signal,
          });
          if (!response.ok) throw apiError(502, 'AI_CONNECTION_TEST_FAILED', `Provider returned HTTP ${response.status}.`);
          const payload = await response.json() as { data?: Array<{ id?: unknown }> };
          const modelIds = Array.isArray(payload.data)
            ? payload.data.map((item) => typeof item?.id === 'string' ? item.id : undefined).filter((id): id is string => Boolean(id))
            : [];
          if (!modelIds.includes(connection.model)) {
            throw apiError(502, 'AI_CONNECTION_MODEL_UNAVAILABLE', `Provider does not advertise the selected model: ${connection.model}.`);
          }
          return { ok: true, model: connection.model, testedAt: new Date(now()).toISOString() };
        } catch (error) {
          if (error instanceof AiApiError) throw error;
          throw apiError(502, 'AI_CONNECTION_TEST_FAILED', 'Provider connection test failed.');
        } finally {
          clearTimeout(timer);
        }
      }
    },
  };

  function cleanupState(): void {
    sessions.cleanup();
    registry.cleanup();
    for (const sessionId of activeSessionIds) {
      if (!sessions.get(sessionId)) activeSessionIds.delete(sessionId);
    }
  }

  function findConnection(connectionId: string): ResolvedAiConnection | undefined {
    for (const sessionId of activeSessionIds) {
      try {
        return registry.resolveForCompanion(sessionId, connectionId);
      } catch {
        // The registry is intentionally session-bound; no global record lookup
        // is exposed to the websocket layer.
      }
    }
    return undefined;
  }

  function sessionBindingFor(sessionId: string): string {
    return createHmac('sha256', config.sessionSecret).update(`job:${sessionId}`).digest('base64url');
  }

  function acceptPairing(
    pairingId: string,
    token: string,
    origin: string,
    expectedOrigin: string,
  ): { connectionId: string; pairingId: string } | undefined {
    if (origin !== expectedOrigin) return undefined;
    const pairing = pairings.consume(pairingId, token, origin);
    if (!pairing) return undefined;
    const connection = registry.createLocalCodex(pairing.sessionId, {
      model: pairing.model,
      reviewModel: pairing.reviewModel,
      reasoningEffort: pairing.reasoningEffort,
    }, { status: 'pairing', pairingId: pairing.id });
    activeSessionIds.add(pairing.sessionId);
    return { connectionId: connection.id, pairingId: pairing.id };
  }

  function completeGate(connectionId: string, result: CompanionGateResultMessage): void {
    const connection = findConnection(connectionId);
    if (!connection || connection.status !== 'pairing') return;
    if (!result.ok) {
      const diagnostic = sanitizeCompanionDiagnostic(result.diagnostic) ?? 'Companion 零工具安全门禁未通过。';
      registry.updateStatus(connection.sessionId, connection.id, 'blocked', diagnostic);
      if (connection.companionId) {
        const pairing = connection.pairingId
          ? pairings.get(connection.sessionId, connection.pairingId)
          : undefined;
        if (pairing) pairings.markBlocked(pairing.id, diagnostic);
      }
      companionHub.abort(connectionId);
      return;
    }
    registry.updateStatus(connection.sessionId, connection.id, 'ready');
    if (connection.companionId) {
      const pairing = connection.pairingId
        ? pairings.get(connection.sessionId, connection.pairingId)
        : undefined;
      if (pairing) pairings.markConnected(pairing.id, connection.id);
    }
  }
}

function sanitizeCompanionDiagnostic(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const message = value.trim().slice(0, 500);
  if (!message) return undefined;
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, 'Bearer [redacted]')
    .replace(/(?:api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/giu, '$1=[redacted]');
}

class AiApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'AiApiError';
  }
}

function apiError(status: number, code: string, message: string): AiApiError {
  return new AiApiError(status, code, message);
}

function errorResponse(error: unknown): Response {
  if (error instanceof AiApiError) return jsonFailure(error.status, error.code, error.message);
  if (error instanceof AiConnectionError) {
    const status = error.code === 'AI_CONNECTION_NOT_FOUND' ? 404 : error.code === 'AI_CONNECTION_INVALID' ? 400 : 409;
    return jsonFailure(status, error.code, error.message);
  }
  if (error instanceof SyntaxError) return jsonFailure(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  const message = error instanceof Error ? error.message : 'AI connection request failed.';
  if (/Origin|CSRF/.test(message)) return jsonFailure(403, 'REQUEST_FORBIDDEN', message);
  if (/required|allowlist|HTTPS|credentials|public host|query or fragment|reasoning|string|at most/i.test(message)) {
    return jsonFailure(400, 'AI_CONNECTION_INVALID', message);
  }
  return jsonFailure(500, 'AI_CONNECTION_ERROR', 'AI connection request failed.');
}

function loadSiteSettings(env: Record<string, string | undefined>) {
  try {
    const settings = loadMonsterIntakeConfig(env);
    if (settings.authMode !== 'api-key') {
      throw new Error('Site AI must use a server-side API key provider.');
    }
    return {
      model: settings.model,
      reviewModel: settings.reviewModel,
      reasoningEffort: settings.reasoningEffort ?? 'high' as const,
    };
  } catch (error) {
    if (error instanceof AiApiError) throw error;
    throw apiError(503, 'SITE_AI_MISCONFIGURED', error instanceof Error ? error.message : 'Site AI is not configured.');
  }
}

function reasoningEffort(value: unknown): 'low' | 'medium' | 'high' | 'xhigh' | 'max' {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh' || value === 'max') return value;
  throw new Error('reasoningEffort must be low, medium, high, xhigh, or max.');
}

function requiredString(value: unknown, name: string, maxLength = 256): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${name} must be at most ${maxLength} characters.`);
  return normalized;
}

function optionalString(value: unknown, maxLength = 256): string | undefined {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return undefined;
  if (typeof value !== 'string') throw new Error('Value must be a string.');
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`Value must be at most ${maxLength} characters.`);
  return normalized;
}

async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw apiError(413, 'REQUEST_TOO_LARGE', 'Request body is too large.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw apiError(413, 'REQUEST_TOO_LARGE', 'Request body is too large.');
  return (text.trim() ? JSON.parse(text) : {}) as T;
}

function jsonSuccess(data: unknown): Response {
  return json({ ok: true, data });
}

function jsonFailure(status: number, code: string, message: string): Response {
  return json({ ok: false, error: { code, message } }, status);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function withCookie(response: Response, setCookie: string | undefined): Response {
  if (setCookie) response.headers.set('set-cookie', setCookie);
  response.headers.set('cache-control', 'no-store');
  return response;
}
