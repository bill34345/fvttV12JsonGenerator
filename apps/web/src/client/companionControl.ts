import {
  COMPANION_CONTROL_HEADER,
  COMPANION_CONTROL_PROTOCOL_VERSION,
  COMPANION_CONTROL_URL,
  COMPANION_LOCAL_WEB_ORIGIN,
  isCompanionLocalDevOrigin,
  isCompanionRemoteOrigin,
  isLocalCompanionActionResponse,
  isLocalCompanionApprovalMessage,
  isLocalCompanionHealth,
  isLocalCompanionPairResponse,
  type LocalCompanionActionResponse,
  type LocalCompanionHealth,
  type LocalCompanionPairRequest,
  type LocalCompanionPairResponse,
} from '../companion/controlProtocol';

const REMOTE_APPROVAL_TIMEOUT_MS = 5 * 60 * 1_000;
const REMOTE_APPROVAL_POPUP_CHECK_MS = 250;

export interface RemoteCompanionApproval {
  status: 'approved';
  approvalId: string;
  instanceId: string;
  pairAuthorization: string;
}

export class CompanionControlError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CompanionControlError';
  }
}

/** Browser-only client for the loopback Companion control plane. */
export class CompanionControlClient {
  isLocalDevelopmentPage(): boolean {
    return typeof window !== 'undefined' && isCompanionLocalDevOrigin(window.location.origin);
  }

  isRemotePage(): boolean {
    return typeof window !== 'undefined' && isCompanionRemoteOrigin(window.location.origin);
  }

  openRemoteConfirmationWindow(): Window {
    this.assertSupportedBrowser();
    if (!this.isRemotePage()) {
      throw new CompanionControlError('COMPANION_REMOTE_HTTPS_REQUIRED', '远程 Companion 只能从 HTTPS 网页发起连接。');
    }
    const popup = window.open('about:blank', 'fvtt-companion-confirmation', 'popup,width=560,height=560');
    if (!popup) {
      throw new CompanionControlError(
        'COMPANION_CONFIRMATION_POPUP_BLOCKED',
        '浏览器拦截了本机确认窗口。请允许弹窗后重新点击“连接本机 Companion”。',
      );
    }
    return popup;
  }

  async health(controlUrl: string): Promise<LocalCompanionHealth> {
    this.assertSupportedBrowser();
    if (!this.isLocalDevelopmentPage()) {
      throw new CompanionControlError(
        'COMPANION_CONFIRMATION_REQUIRED',
        '远程网页不会直接读取本机 Companion；请点击连接并在弹出的本机确认页批准这个网站。',
      );
    }
    const payload = await this.request(controlUrl, '/v2/health');
    if (!isLocalCompanionHealth(payload)) {
      throw new CompanionControlError('COMPANION_PROTOCOL_UNSUPPORTED', '本机 Companion 返回了未知的控制协议。');
    }
    return payload;
  }

  async waitForRemoteApproval(
    controlUrl: string,
    pairingId: string,
    popup: Window,
  ): Promise<RemoteCompanionApproval> {
    this.assertSupportedBrowser();
    if (!this.isRemotePage()) {
      throw new CompanionControlError('COMPANION_REMOTE_HTTPS_REQUIRED', '远程 Companion 只能从 HTTPS 网页发起连接。');
    }
    const origin = this.currentOrigin();
    const approvalId = browserRandomId();
    const confirmationUrl = new URL('/v2/approve', this.assertControlUrl(controlUrl));
    confirmationUrl.searchParams.set('origin', origin);
    confirmationUrl.searchParams.set('approvalId', approvalId);
    confirmationUrl.searchParams.set('pairingId', pairingId);
    const signal = this.waitForRemoteApprovalSignal(approvalId, popup);
    try {
      popup.location.href = confirmationUrl.toString();
    } catch {
      signal.cancel();
      throw new CompanionControlError(
        'COMPANION_CONFIRMATION_POPUP_BLOCKED',
        '无法打开本机确认页。请允许弹窗后重新点击连接。',
      );
    }

    let approval;
    try {
      approval = await signal.promise;
    } finally {
      signal.cancel();
    }
    if (approval.status === 'rejected') {
      throw new CompanionControlError('COMPANION_CONFIRMATION_REJECTED', '你已在本机确认页拒绝这个网站连接 Companion。');
    }
    return {
      status: 'approved',
      approvalId,
      instanceId: approval.instanceId,
      pairAuthorization: approval.pairAuthorization,
    };
  }

  async pair(
    controlUrl: string,
    input: Omit<LocalCompanionPairRequest, 'protocolVersion' | 'origin'>,
  ): Promise<LocalCompanionPairResponse> {
    this.assertSupportedBrowser();
    const remote = this.isRemotePage();
    if (!remote && !this.isLocalDevelopmentPage()) {
      throw new CompanionControlError('COMPANION_REMOTE_HTTPS_REQUIRED', 'Companion 只支持本机开发页或 HTTPS 远程网页。');
    }
    const payload = await this.request(controlUrl, '/v2/pair', {
      method: 'POST',
      body: JSON.stringify({
        protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
        origin: this.currentOrigin(),
        ...input,
      } satisfies LocalCompanionPairRequest),
    }, remote);
    if (!isLocalCompanionPairResponse(payload)) {
      throw new CompanionControlError('COMPANION_PROTOCOL_UNSUPPORTED', '本机 Companion 的配对响应不受支持。');
    }
    return payload;
  }

  async disconnect(
    controlUrl: string,
    instanceId: string,
    controlCredential: string,
  ): Promise<LocalCompanionActionResponse> {
    return this.action(controlUrl, '/v2/disconnect', instanceId, controlCredential);
  }

  async shutdown(
    controlUrl: string,
    instanceId: string,
    controlCredential: string,
  ): Promise<LocalCompanionActionResponse> {
    return this.action(controlUrl, '/v2/shutdown', instanceId, controlCredential);
  }

  private async action(
    controlUrl: string,
    path: string,
    instanceId: string,
    controlCredential: string,
  ): Promise<LocalCompanionActionResponse> {
    this.assertSupportedBrowser();
    const remote = this.isRemotePage();
    if (!remote && !this.isLocalDevelopmentPage()) {
      throw new CompanionControlError('COMPANION_REMOTE_HTTPS_REQUIRED', 'Companion 只支持本机开发页或 HTTPS 远程网页。');
    }
    const payload = await this.request(controlUrl, path, {
      method: 'POST',
      body: JSON.stringify({
        protocolVersion: COMPANION_CONTROL_PROTOCOL_VERSION,
        instanceId,
        controlCredential,
      }),
    }, remote);
    if (!isLocalCompanionActionResponse(payload)) {
      throw new CompanionControlError('COMPANION_PROTOCOL_UNSUPPORTED', '本机 Companion 的操作响应不受支持。');
    }
    return payload;
  }

  private async request(
    controlUrl: string,
    path: string,
    init: RequestInit = {},
    remote = false,
  ): Promise<unknown> {
    const controlOrigin = this.assertControlUrl(controlUrl);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), remote ? 4_000 : 1_500);
    try {
      const requestInit: RequestInit & { targetAddressSpace?: 'local' } = {
        ...init,
        mode: 'cors',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          [COMPANION_CONTROL_HEADER]: String(COMPANION_CONTROL_PROTOCOL_VERSION),
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(init.headers ?? {}),
        },
      };
      if (remote) requestInit.targetAddressSpace = 'local';
      const response = await fetch(`${controlOrigin}${path}`, requestInit);
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
      if (remote) {
        throw new CompanionControlError(
          'COMPANION_LOCAL_NETWORK_PERMISSION_REQUIRED',
          '浏览器没有允许该 HTTPS 网站访问本机网络。请在 Chrome 或 Edge 地址栏允许“本地网络访问”后重试。',
        );
      }
      throw new CompanionControlError('COMPANION_NOT_DETECTED', '未检测到本机 Companion；请确认 EXE 已启动且未被安全软件拦截。');
    } finally {
      window.clearTimeout(timer);
    }
  }

  private waitForRemoteApprovalSignal(
    approvalId: string,
    popup: Window,
  ): {
    promise: Promise<RemoteCompanionApproval | { status: 'rejected' }>;
    cancel: () => void;
  } {
    let cleanup = () => undefined;
    const promise = new Promise<RemoteCompanionApproval | { status: 'rejected' }>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new CompanionControlError('COMPANION_APPROVAL_EXPIRED', '等待本机确认超过五分钟。请重新点击连接。'));
      }, REMOTE_APPROVAL_TIMEOUT_MS);
      const closedCheck = window.setInterval(() => {
        if (!popup.closed) return;
        cleanup();
        reject(new CompanionControlError('COMPANION_CONFIRMATION_WINDOW_CLOSED', '本机确认窗口已关闭，尚未允许连接。请重新点击连接。'));
      }, REMOTE_APPROVAL_POPUP_CHECK_MS);
      const listener = (event: MessageEvent<unknown>) => {
        if (event.origin !== COMPANION_CONTROL_URL || event.source !== popup || !isLocalCompanionApprovalMessage(event.data)) return;
        const message = event.data;
        if (message.approvalId !== approvalId) return;
        cleanup();
        if (message.status === 'rejected') {
          resolve({ status: 'rejected' });
          return;
        }
        if (message.status !== 'approved' || !message.instanceId || !message.pairAuthorization) {
          reject(new CompanionControlError('COMPANION_PROTOCOL_UNSUPPORTED', '本机确认页返回了未知的授权信息。'));
          return;
        }
        resolve({ status: 'approved', approvalId, instanceId: message.instanceId, pairAuthorization: message.pairAuthorization });
      };
      cleanup = () => {
        window.clearTimeout(timer);
        window.clearInterval(closedCheck);
        window.removeEventListener('message', listener);
      };
      window.addEventListener('message', listener);
    });
    return { promise, cancel: () => cleanup() };
  }

  private assertSupportedBrowser(): void {
    if (typeof navigator === 'undefined') return;
    const userAgent = navigator.userAgent;
    if (/Firefox\//u.test(userAgent)) {
      throw new CompanionControlError('COMPANION_BROWSER_UNSUPPORTED', '本机 Companion 目前只支持最新版 Windows Chrome 和 Edge；Firefox 不在支持范围内。');
    }
    if (!/(?:Chrome|Edg)\//u.test(userAgent)) {
      throw new CompanionControlError('COMPANION_BROWSER_UNSUPPORTED', '本机 Companion 目前只支持最新版 Windows Chrome 和 Edge。');
    }
  }

  private currentOrigin(): string {
    if (typeof window === 'undefined') throw new CompanionControlError('COMPANION_BROWSER_REQUIRED', 'Companion 只能从浏览器页面发起连接。');
    return window.location.origin;
  }

  private assertControlUrl(value: string): string {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new CompanionControlError('COMPANION_CONTROL_URL_INVALID', 'Companion 控制地址无效。');
    }
    if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new CompanionControlError('COMPANION_CONTROL_URL_INVALID', 'Companion 只能连接本机 127.0.0.1 控制服务。');
    }
    return parsed.origin;
  }
}

function browserRandomId(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export const companionControlClient = new CompanionControlClient();

export { COMPANION_LOCAL_WEB_ORIGIN };
