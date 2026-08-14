import {
  CheckCircledIcon,
  CrossCircledIcon,
  ExclamationTriangleIcon,
  GearIcon,
  GlobeIcon,
  Link2Icon,
  MagicWandIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type {
  AiConnection,
  AiConnectionsOverview,
  AiReasoningEffort,
  CodexPairing,
  LocalCompanionHealth,
} from "./aiConnections";

export interface AiConnectionsPanelProps {
  open: boolean;
  overview: AiConnectionsOverview | null;
  selectedConnectionId: string;
  pairing: CodexPairing | null;
  companionHealth: LocalCompanionHealth | null;
  companionControlError: string;
  busy: boolean;
  error: string;
  message: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSelect: (connection: AiConnection) => void;
  onSelectSite: () => Promise<void>;
  onConnectByok: (input: {
    apiKey: string;
    baseUrl: string;
    model: string;
    reviewModel: string;
    reasoningEffort: AiReasoningEffort;
  }) => Promise<void>;
  onTest: (connectionId: string) => Promise<void>;
  onDisconnect: (connectionId: string) => Promise<void>;
  onConnectCompanion: (input: {
    model: string;
    reviewModel: string;
    reasoningEffort: AiReasoningEffort;
  }) => Promise<void>;
  onDisconnectCompanion: () => Promise<void>;
  onShutdownCompanion: () => Promise<void>;
  onRefreshPairing: () => Promise<void>;
}

const reasoningOptions: AiReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

function kindLabel(kind: AiConnection["kind"]): string {
  switch (kind) {
    case "site":
      return "站点托管";
    case "user-api-key":
      return "用户 API Key";
    case "local-codex":
      return "本机 Codex Companion";
  }
}

function statusLabel(status: AiConnection["status"]): string {
  switch (status) {
    case "ready":
      return "可用";
    case "pairing":
      return "配对中";
    case "offline":
      return "离线";
    case "blocked":
      return "已阻止";
    case "expired":
      return "已过期";
  }
}

function pairingStatusLabel(status: CodexPairing["status"]): string {
  switch (status) {
    case "pending":
      return "等待运行 Companion";
    case "verifying":
      return "正在验证模型与安全门禁";
    case "connected":
      return "已连接";
    case "blocked":
      return "已阻止";
    case "disconnected":
      return "已离线";
    case "expired":
      return "已过期";
  }
}

function statusIcon(status: AiConnection["status"]) {
  if (status === "ready") return <CheckCircledIcon />;
  if (status === "blocked" || status === "expired") {
    return <CrossCircledIcon />;
  }
  return <ExclamationTriangleIcon />;
}

function connectionIcon(kind: AiConnection["kind"]) {
  if (kind === "site") return <GlobeIcon />;
  if (kind === "local-codex") return <Link2Icon />;
  return <GearIcon />;
}

function connectionDescription(connection: AiConnection): string {
  if (connection.kind === "site") {
    return "由 Web 服务端持有 provider 配置；浏览器不会接触密钥。";
  }
  if (connection.kind === "local-codex") {
    return "通过一次性配对连接本机官方 Codex CLI，OAuth 留在本机。";
  }
  return "密钥只保存在当前匿名会话内存中，不写入浏览器持久存储。";
}

function connectionStatusClass(connection: AiConnection): string {
  return [
    "ai-connection-status",
    connection.status === "ready" ? "is-ready" : "is-warning",
  ]
    .filter(Boolean)
    .join(" ");
}

export function AiConnectionsPanel(props: AiConnectionsPanelProps) {
  const [byokOpen, setByokOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-5.6-luna");
  const [reviewModel, setReviewModel] = useState("gpt-5.6-luna");
  const [reasoningEffort, setReasoningEffort] =
    useState<AiReasoningEffort>("xhigh");
  const [pairingModel, setPairingModel] = useState("gpt-5.6-luna");
  const [pairingReviewModel, setPairingReviewModel] =
    useState("gpt-5.6-luna");
  const [pairingReasoningEffort, setPairingReasoningEffort] =
    useState<AiReasoningEffort>("xhigh");

  const siteConnection = useMemo(
    () => props.overview?.connections.find((connection) => connection.kind === "site"),
    [props.overview],
  );
  const byokConnections = useMemo(
    () =>
      props.overview?.connections.filter(
        (connection) => connection.kind === "user-api-key",
      ) ?? [],
    [props.overview],
  );
  const codexConnection = useMemo(
    () => props.overview?.connections.find((connection) => connection.kind === "local-codex"),
    [props.overview],
  );

  if (!props.open) return null;

  async function submitByok(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiKey.trim() || !model.trim()) return;
    await props.onConnectByok({
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      reviewModel: reviewModel.trim() || model.trim(),
      reasoningEffort,
    });
    setApiKey("");
    setByokOpen(false);
  }

  async function submitPairing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await connectPairing();
  }

  async function connectPairing() {
    await props.onConnectCompanion({
      model: pairingModel.trim() || "gpt-5.6-luna",
      reviewModel: pairingReviewModel.trim() || pairingModel.trim() || "gpt-5.6-luna",
      reasoningEffort: pairingReasoningEffort,
    });
  }

  function renderConnectionCard(connection: AiConnection) {
    const isSelected = props.selectedConnectionId === connection.id;
    const canSelect = connection.status === "ready";
    return (
      <article
        key={connection.id}
        className={[
          "ai-connection-card",
          isSelected ? "is-selected" : "",
          connection.status === "ready" ? "is-ready" : "is-muted",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="ai-connection-card-head">
          <span className="ai-connection-icon">{connectionIcon(connection.kind)}</span>
          <div className="ai-connection-card-copy">
            <div className="ai-connection-card-title-row">
              <strong>{connection.providerLabel || kindLabel(connection.kind)}</strong>
              <span className={connectionStatusClass(connection)}>
                {statusIcon(connection.status)}
                {statusLabel(connection.status)}
              </span>
            </div>
            <span>{kindLabel(connection.kind)} · {connection.model}</span>
          </div>
        </div>
        <p>{connectionDescription(connection)}</p>
        {connection.keyHint ? (
          <code className="ai-connection-key-hint">{connection.keyHint}</code>
        ) : null}
        {connection.diagnostic ? (
          <div className="ai-connection-diagnostic">{connection.diagnostic}</div>
        ) : null}
        <div className="ai-connection-card-actions">
          <button
            type="button"
            className={isSelected ? "ai-connection-button is-selected" : "ai-connection-button is-primary"}
            disabled={!canSelect || props.busy}
            onClick={() => props.onSelect(connection)}
          >
            {isSelected ? "当前任务使用" : canSelect ? "选择" : statusLabel(connection.status)}
          </button>
          {connection.kind !== "local-codex" ? (
            <button
              type="button"
              className="ai-connection-button"
              disabled={props.busy || !canSelect}
              onClick={() => void props.onTest(connection.id)}
            >
              测试连接
            </button>
          ) : null}
          <button
            type="button"
            className="ai-connection-button is-danger"
            disabled={props.busy}
            onClick={() => void props.onDisconnect(connection.id)}
          >
            断开
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="ai-connection-layer" role="presentation">
      <button
        type="button"
        className="ai-connection-backdrop"
        aria-label="关闭 AI 连接面板"
        onClick={props.onClose}
      />
      <aside
        className="ai-connection-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-connection-title"
      >
        <header className="ai-connection-header">
          <div>
            <span className="ai-connection-kicker">运行前设置</span>
            <h2 id="ai-connection-title">AI 连接</h2>
            <p>选择本次 Intake 使用的 provider；任务提交时会把连接 ID 绑定到任务。</p>
          </div>
          <button
            type="button"
            className="ai-connection-close"
            aria-label="关闭 AI 连接面板"
            onClick={props.onClose}
          >
            ×
          </button>
        </header>

        <div className="ai-connection-scroll">
          <div className="ai-connection-toolbar">
            <span>
              {props.overview
                ? `${props.overview.connections.length} 个连接 · 会话密钥不持久化`
                : "正在读取当前会话的连接能力"}
            </span>
            <button
              type="button"
              className="ai-connection-icon-button"
              disabled={props.busy}
              onClick={() => void props.onRefresh()}
              aria-label="刷新 AI 连接"
              title="刷新"
            >
              <ReloadIcon className={props.busy ? "spin" : ""} />
            </button>
          </div>

          {props.error ? (
            <div className="ai-connection-callout is-error">
              <ExclamationTriangleIcon />
              <div>
                <strong>连接入口暂不可用</strong>
                <span>{props.error}</span>
              </div>
            </div>
          ) : null}
          {props.message ? (
            <div className="ai-connection-callout is-success">
              <CheckCircledIcon />
              <span>{props.message}</span>
            </div>
          ) : null}

          {!props.overview ? (
            <section className="ai-connection-empty">
              <MagicWandIcon />
              <strong>需要连接 API 才能运行 AI Intake</strong>
              <p>
                当前 Web 服务没有返回 AI 连接清单。请确认服务已更新到包含
                <code>/api/ai-connections</code> 的版本，然后点击刷新。
              </p>
              <button
                type="button"
                className="ai-connection-button is-primary"
                disabled={props.busy}
                onClick={() => void props.onRefresh()}
              >
                重新读取
              </button>
            </section>
          ) : (
            <>
              <section className="ai-connection-section">
                <div className="ai-connection-section-heading">
                  <div>
                    <span>三种入口</span>
                    <strong>选择一个可用连接</strong>
                  </div>
                  <small>单次任务只使用一个 provider</small>
                </div>

                <article className="ai-connection-card ai-companion-modern-card">
                  <div className="ai-connection-card-head">
                    <span className="ai-connection-icon"><Link2Icon /></span>
                    <div className="ai-connection-card-copy">
                      <div className="ai-connection-card-title-row">
                        <strong>本机 Codex Companion</strong>
                        <span className={props.companionHealth?.status === "connected" ? "ai-connection-status is-ready" : "ai-connection-status is-warning"}>
                          {props.companionHealth?.status === "connected" ? <CheckCircledIcon /> : <ExclamationTriangleIcon />}
                          {props.companionHealth?.status === "connected" ? "已连接" : props.companionHealth ? "已启动" : "未检测到"}
                        </span>
                      </div>
                      <span>官方 Codex CLI 保留在本机，网页只接收 zero-tool 模型响应。</span>
                    </div>
                  </div>
                  <p>双击 Companion 后，网页会自动检测本机服务；无需打开终端，也不会把敏感凭据暴露给命令行。</p>
                  <form className="ai-connection-form is-compact ai-companion-settings-form" onSubmit={(event) => void submitPairing(event)}>
                    <div className="ai-connection-form-heading"><strong>连接参数</strong><span>默认 gpt-5.6-luna + xhigh；只有点击连接时才会开始配对。</span></div>
                    <div className="ai-connection-form-grid">
                      <label className="ai-connection-field"><span>主模型</span><input value={pairingModel} onChange={(event) => setPairingModel(event.target.value)} /></label>
                      <label className="ai-connection-field"><span>审查模型</span><input value={pairingReviewModel} onChange={(event) => setPairingReviewModel(event.target.value)} /></label>
                    </div>
                    <label className="ai-connection-field"><span>Reasoning</span><select value={pairingReasoningEffort} onChange={(event) => setPairingReasoningEffort(event.target.value as AiReasoningEffort)}>{reasoningOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                  </form>
                  <div className="ai-companion-steps" aria-label="本机 Companion 连接步骤">
                    <div className="ai-companion-step">
                      <span>1</span>
                      <div>
                        <strong>下载并双击 EXE</strong>
                        <small>Companion 会在本机后台启动，不会创建第二个 Web 地址。</small>
                        {props.overview.companion.artifact.available && props.overview.companion.artifact.downloadUrl ? (
                          <a className="ai-connection-button is-primary" href={props.overview.companion.artifact.downloadUrl} download={props.overview.companion.artifact.fileName}>
                            下载 {props.overview.companion.artifact.fileName}
                          </a>
                        ) : (
                          <span className="ai-connection-inline-warning">编译产物不可用，请先运行 <code>bun run web:companion:build</code>。</span>
                        )}
                        {props.overview.companion.artifact.sha256 ? <small>SHA-256：{props.overview.companion.artifact.sha256}</small> : null}
                      </div>
                    </div>
                    <div className="ai-companion-step">
                      <span>2</span>
                      <div>
                        <strong>{props.companionHealth ? "网页已检测到 Companion" : "等待网页检测 Companion"}</strong>
                        <small>{props.companionControlError || "本机控制端口仅接受 127.0.0.1:5173。双击后通常两秒内出现已启动状态。"}</small>
                      </div>
                    </div>
                    <div className="ai-companion-step">
                      <span>3</span>
                      <div>
                        <strong>选择模型与 reasoning</strong>
                        <small>点击连接时，网页会安全交接五分钟一次性配对，不显示 Token。</small>
                      </div>
                    </div>
                    <div className="ai-companion-step">
                      <span>4</span>
                      <div>
                        <strong>等待两个模型通过 zero-tool gate</strong>
                        <small>连接成功后自动设为当前 AI Intake 连接；失败会显示可操作诊断。</small>
                      </div>
                    </div>
                  </div>
                  <div className="ai-connection-card-actions">
                    {props.companionHealth ? (
                      <>
                        <button type="button" className="ai-connection-button is-primary" disabled={props.busy || !props.overview.companion.artifact.available || props.companionHealth.status === "connecting" || props.companionHealth.status === "verifying" || props.companionHealth.status === "connected"} onClick={() => void connectPairing()}>
                          {props.companionHealth.status === "connected" ? "Companion 已连接" : "连接本机 Companion"}
                        </button>
                        {props.companionHealth.status === "connecting" || props.companionHealth.status === "verifying" || props.companionHealth.status === "connected" ? (
                          <button type="button" className="ai-connection-button" disabled={props.busy} onClick={() => void props.onDisconnectCompanion()}>断开连接</button>
                        ) : null}
                        <button type="button" className="ai-connection-button" disabled={props.busy} onClick={() => void props.onShutdownCompanion()}>退出 Companion</button>
                      </>
                    ) : (
                      <span className="ai-connection-inline-warning">请先下载并双击 EXE；网页会自动检测，不需要运行命令。</span>
                    )}
                  </div>
                  {props.pairing ? (
                    <section className="ai-connection-pairing ai-companion-modern-pairing">
                      <div className="ai-connection-pairing-heading">
                        <div>
                          <strong>配对状态：{pairingStatusLabel(props.pairing.status)}</strong>
                          <span>{props.pairing.status === "connected" ? "两个模型的 zero-tool gate 均已通过。" : "网页会自动检查状态，无需复制命令。"}</span>
                        </div>
                        <button type="button" className="ai-connection-text-button" disabled={props.busy} onClick={() => void props.onRefreshPairing()}>立即检查</button>
                      </div>
                      {props.pairing.diagnostic ? <div className="ai-connection-diagnostic">{props.pairing.diagnostic}</div> : null}
                    </section>
                  ) : null}
                </article>

                <article
                  className={[
                    "ai-connection-card",
                    siteConnection?.id === props.selectedConnectionId ? "is-selected" : "",
                    siteConnection ? "is-ready" : "is-muted",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="ai-connection-card-head">
                    <span className="ai-connection-icon"><GlobeIcon /></span>
                    <div className="ai-connection-card-copy">
                      <div className="ai-connection-card-title-row">
                        <strong>站点托管 Provider</strong>
                        <span className={siteConnection ? "ai-connection-status is-ready" : "ai-connection-status is-warning"}>
                          {siteConnection ? <CheckCircledIcon /> : <ExclamationTriangleIcon />}
                          {siteConnection ? "可用" : props.overview.siteAvailable ? "未连接" : "未启用"}
                        </span>
                      </div>
                      <span>服务端配置 · 推荐给不想管理密钥的用户</span>
                    </div>
                  </div>
                  <p>浏览器只提交任务，不接触站点的 API Key；额度与模型由服务端配置控制。</p>
                  <div className="ai-connection-card-actions">
                    <button
                      type="button"
                      className={siteConnection?.id === props.selectedConnectionId ? "ai-connection-button is-selected" : "ai-connection-button is-primary"}
                      disabled={!props.overview.siteAvailable || props.busy}
                      onClick={() => {
                        if (siteConnection) props.onSelect(siteConnection);
                        else void props.onSelectSite();
                      }}
                    >
                      {siteConnection?.id === props.selectedConnectionId
                        ? "当前任务使用"
                        : siteConnection
                          ? "选择"
                          : props.overview.siteAvailable
                            ? "启用站点连接"
                            : "服务端未启用"}
                    </button>
                    {siteConnection ? (
                      <button
                        type="button"
                        className="ai-connection-button"
                        disabled={props.busy}
                        onClick={() => void props.onTest(siteConnection.id)}
                      >
                        测试连接
                      </button>
                    ) : null}
                  </div>
                </article>

                {byokConnections.map(renderConnectionCard)}
                {byokOpen ? (
                  <form className="ai-connection-form" onSubmit={(event) => void submitByok(event)}>
                    <div className="ai-connection-form-heading">
                      <div>
                        <strong>连接自己的 API Key</strong>
                        <span>仅保存在当前会话内存，刷新或过期后需要重新输入。</span>
                      </div>
                      <button
                        type="button"
                        className="ai-connection-text-button"
                        onClick={() => setByokOpen(false)}
                      >
                        收起
                      </button>
                    </div>
                    <label className="ai-connection-field">
                      <span>API Key</span>
                      <input
                        type="password"
                        autoComplete="off"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder="sk-..."
                        required
                      />
                    </label>
                    <div className="ai-connection-form-grid">
                      <label className="ai-connection-field">
                        <span>Base URL</span>
                        <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
                      </label>
                      <label className="ai-connection-field">
                        <span>Reasoning</span>
                        <select value={reasoningEffort} onChange={(event) => setReasoningEffort(event.target.value as AiReasoningEffort)}>
                          {reasoningOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="ai-connection-form-grid">
                      <label className="ai-connection-field">
                        <span>主模型</span>
                        <input value={model} onChange={(event) => setModel(event.target.value)} required />
                      </label>
                      <label className="ai-connection-field">
                        <span>审查模型</span>
                        <input value={reviewModel} onChange={(event) => setReviewModel(event.target.value)} />
                      </label>
                    </div>
                    <button type="submit" className="ai-connection-button is-primary" disabled={props.busy || !apiKey.trim()}>
                      连接并保存
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="ai-connection-add-card"
                    disabled={props.busy}
                    onClick={() => setByokOpen(true)}
                  >
                    <span className="ai-connection-icon"><GearIcon /></span>
                    <span>
                      <strong>连接用户 API Key</strong>
                      <small>OpenAI 兼容 Base URL · 你自己控制模型与额度</small>
                    </span>
                    <span aria-hidden="true">＋</span>
                  </button>
                )}

                <article
                  className={[
                    "ai-connection-card",
                    "ai-connection-legacy-card",
                    codexConnection?.id === props.selectedConnectionId ? "is-selected" : "",
                    codexConnection?.status === "ready" ? "is-ready" : "is-muted",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="ai-connection-card-head">
                    <span className="ai-connection-icon"><Link2Icon /></span>
                    <div className="ai-connection-card-copy">
                      <div className="ai-connection-card-title-row">
                        <strong>本机 Codex Companion</strong>
                        <span className={codexConnection?.status === "ready" ? "ai-connection-status is-ready" : "ai-connection-status is-warning"}>
                          {codexConnection ? statusIcon(codexConnection.status) : <Link2Icon />}
                          {codexConnection ? statusLabel(codexConnection.status) : props.overview.companion.available ? "待配对" : "未启用"}
                        </span>
                      </div>
                      <span>Codex OAuth 留在本机 · Web 只接收零工具的文本推理</span>
                    </div>
                  </div>
                  <p>{props.overview.companion.diagnostic ?? "通过一次性 token 将本机官方 CLI 连接到当前 Web 会话。"}</p>
                  <div className="ai-companion-steps" aria-label="本机 Companion 连接步骤">
                    <div className="ai-companion-step">
                      <span>1</span>
                      <div>
                        <strong>下载 Windows Companion</strong>
                        <small>固定编译产物，不读取或上传 Codex OAuth 文件。</small>
                        {props.overview.companion.artifact.available && props.overview.companion.artifact.downloadUrl ? (
                          <a
                            className="ai-connection-button is-primary"
                            href={props.overview.companion.artifact.downloadUrl}
                            download={props.overview.companion.artifact.fileName}
                          >
                            下载 {props.overview.companion.artifact.fileName}
                          </a>
                        ) : (
                          <span className="ai-connection-inline-warning">
                            编译产物不可用，请先运行 <code>bun run web:companion:build</code>。
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ai-companion-step">
                      <span>2</span>
                      <div>
                        <strong>选择主模型、审查模型与 reasoning</strong>
                        <small>配对后由 Companion 对这两个模型分别执行零工具门禁。</small>
                      </div>
                    </div>
                    <div className="ai-companion-step">
                      <span>3</span>
                      <div>
                        <strong>生成五分钟一次性配对</strong>
                        <small>token 只展示在当前页面内，首次握手后立即失效。</small>
                      </div>
                    </div>
                    <div className="ai-companion-step">
                      <span>4</span>
                      <div>
                        <strong>等待网页自动连接</strong>
                        <small>旧版诊断入口已隐藏；请使用上方的自动检测与连接。</small>
                      </div>
                    </div>
                  </div>
                  <div className="ai-connection-card-actions">
                    {codexConnection && (codexConnection.status === "ready" || codexConnection.status === "pairing") ? (
                      <>
                        <button
                          type="button"
                          className={codexConnection.id === props.selectedConnectionId ? "ai-connection-button is-selected" : "ai-connection-button is-primary"}
                          disabled={codexConnection.status !== "ready" || props.busy}
                          onClick={() => props.onSelect(codexConnection)}
                        >
                          {codexConnection.id === props.selectedConnectionId ? "当前任务使用" : "选择"}
                        </button>
                        <button
                          type="button"
                          className="ai-connection-button"
                          disabled={props.busy || codexConnection.status !== "ready"}
                          onClick={() => void props.onTest(codexConnection.id)}
                        >
                          测试连接
                        </button>
                        <button
                          type="button"
                          className="ai-connection-button is-danger"
                          disabled={props.busy}
                          onClick={() => void props.onDisconnect(codexConnection.id)}
                        >
                          断开
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="ai-connection-button is-primary"
                        disabled={!props.overview.companion.available || !props.overview.companion.artifact.available || props.busy}
                        onClick={() => void props.onConnectCompanion({
                          model: pairingModel.trim() || props.overview!.companion.defaultModel,
                          reviewModel: pairingReviewModel.trim() || pairingModel.trim() || props.overview!.companion.defaultModel,
                          reasoningEffort: pairingReasoningEffort,
                        })}
                      >
                        {!props.overview.companion.available
                          ? "Companion 未启用"
                          : props.overview.companion.artifact.available
                            ? "生成一次性配对"
                            : "等待 Companion 构建"}
                      </button>
                    )}
                  </div>
                </article>

                {(!codexConnection || (codexConnection.status !== "ready" && codexConnection.status !== "pairing")) && props.overview.companion.available ? (
                  <form className="ai-connection-form is-compact" onSubmit={(event) => void submitPairing(event)}>
                    <div className="ai-connection-form-heading">
                      <div>
                        <strong>本机连接参数</strong>
                        <span>默认使用 gpt-5.6-luna + xhigh，可按需调整。</span>
                      </div>
                    </div>
                    <div className="ai-connection-form-grid">
                      <label className="ai-connection-field">
                        <span>主模型</span>
                        <input value={pairingModel} onChange={(event) => setPairingModel(event.target.value)} />
                      </label>
                      <label className="ai-connection-field">
                        <span>审查模型</span>
                        <input value={pairingReviewModel} onChange={(event) => setPairingReviewModel(event.target.value)} />
                      </label>
                    </div>
                    <label className="ai-connection-field">
                      <span>Reasoning</span>
                      <select value={pairingReasoningEffort} onChange={(event) => setPairingReasoningEffort(event.target.value as AiReasoningEffort)}>
                        {reasoningOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    <button type="submit" className="ai-connection-button" disabled={props.busy || !props.overview.companion.artifact.available}>
                      使用这些参数生成配对
                    </button>
                  </form>
                ) : null}

                {props.pairing ? (
                  <section className="ai-connection-pairing">
                    <div className="ai-connection-pairing-heading">
                      <div>
                        <strong>配对状态：{pairingStatusLabel(props.pairing.status)}</strong>
                        <span>
                          {props.pairing.status === "connected"
                            ? "握手与两个模型的零工具门禁均已通过。"
                            : props.pairing.status === "blocked"
                              ? "请按下方诊断修复本机 Codex CLI 后重新生成配对。"
                              : props.pairing.status === "expired"
                                ? "配对有效期为五分钟，请重新生成一次性配对。"
                                : props.pairing.status === "disconnected"
                                  ? "Companion 已退出；重新运行同一命令或生成新的配对。"
                                  : "在同一台电脑上运行下面的命令，页面会每两秒自动检查。"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="ai-connection-text-button"
                        disabled={props.busy}
                        onClick={() => void props.onRefreshPairing()}
                      >
                        刷新状态
                      </button>
                    </div>
                    {props.pairing.diagnostic ? (
                      <div className="ai-connection-diagnostic">{props.pairing.diagnostic}</div>
                    ) : null}
                  </section>
                ) : null}
              </section>
            </>
          )}
        </div>

        <footer className="ai-connection-footer">
          <LockNote />
          <span>连接只决定 AI Intake 的 provider，不会改变 Foundry 14 / core 的输出目标。</span>
        </footer>
      </aside>
    </div>
  );
}

function LockNote() {
  return (
    <span className="ai-connection-lock-note">
      <CheckCircledIcon />
      <strong>凭据边界明确</strong>
    </span>
  );
}
