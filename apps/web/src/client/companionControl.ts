import {
  COMPANION_CONTROL_HEADER,
  COMPANION_CONTROL_PROTOCOL_VERSION,
  COMPANION_WEB_ORIGIN,
  isLocalCompanionActionResponse,
  isLocalCompanionHealth,
  isLocalCompanionPairResponse,
  type LocalCompanionActionResponse,
  type LocalCompanionHealth,
  type LocalCompanionPairRequest,
  type LocalCompanionPairResponse,
} from '../companion/controlProtocol';

export class CompanionControlError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CompanionControlError';
  }
}

export class CompanionControlClient {
  async health(controlUrl: string): Promise<LocalCompanionHealth> {
    this.assertWebOrigin();
    const payload = await this.request(controlUrl, '/v1/health');
    if (!isLocalCompanionHealth(payload)) {
      throw new CompanionControlError('COMPANION_PROTOCOL_UNSUPPORTED', '本机 Companion 返回了未知的控制协议。');
    }
    return payload;
  }

  async pair(controlUrl: string, input: Omit<LocalCompanionPairRequest, 'protocolVersion' | 'origin'>): Promise<LocalCompanionPairResponse> {
    this.assertWebOrigin();
    const payload = await this.request(controlUrl, '/v1/pair', {
      method: 'POST',
      body: JSON.stringify({
        protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
        origin: COMPANION_WEB_ORIGIN,
        ...input,
      } satisfies LocalCompanionPairRequest),
    });
    if (!isLocalCompanionPairResponse(payload)) {
      throw new CompanionControlError('COMPANION_PROTOCOL_UNSUPPORTED', '本机 Companion 的配对响应不受支持。');
    }
    return payload;
  }

  async disconnect(controlUrl: string, instanceId: string): Promise<LocalCompanionActionResponse> {
    return this.action(controlUrl, '/v1/disconnect', instanceId);
  }

  async shutdown(controlUrl: string, instanceId: string): Promise<LocalCompanionActionResponse> {
    return this.action(controlUrl, '/v1/shutdown', instanceId);
  }

  private async action(controlUrl: string, path: string, instanceId: string): Promise<LocalCompanionActionResponse> {
    this.assertWebOrigin();
    const payload = await this.request(controlUrl, path, {
      method: 'POST',
      body: JSON.stringify({
        protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
        instanceId,
      }),
    });
    if (!isLocalCompanionActionResponse(payload)) {
      throw new CompanionControlError('COMPANION_PROTOCOL_UNSUPPORTED', '本机 Companion 的操作响应不受支持。');
    }
    return payload;
  }

  private async request(controlUrl: string, path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1_500);
    try {
      const response = await fetch(`${controlUrl}${path}`, {
        ...init,
        mode: 'cors',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          [COMPANION_CONTROL_HEADER]: String(COMPANION_CONTROL_PROTOCOL_VERSION),
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(init.headers ?? {}),
        },
      });
      const payload = await response.json() as unknown;
      if (!response.ok) {
        const error = isRecord(payload) && isRecord(payload.error) ? payload.error : undefined;
        throw new CompanionControlError(
          typeof error?.code === 'string' ? error.code : 'COMPANION_CONTROL_FAILED',
          typeof error?.message === 'string' ? error.message : '本机 Companion 控制请求失败。',
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof CompanionControlError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new CompanionControlError('COMPANION_NOT_DETECTED', '未检测到本机 Companion；请先双击下载的 EXE。');
      }
      throw new CompanionControlError('COMPANION_NOT_DETECTED', '未检测到本机 Companion；请确认 EXE 已启动且未被安全软件拦截。');
    } finally {
      window.clearTimeout(timer);
    }
  }

  private assertWebOrigin(): void {
    if (typeof window !== 'undefined' && window.location.origin !== COMPANION_WEB_ORIGIN) {
      throw new CompanionControlError('COMPANION_WRONG_WEB_ORIGIN', '请使用 http://127.0.0.1:5173 打开 Web，不能从其他端口连接本机 Companion。');
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export const companionControlClient = new CompanionControlClient();
