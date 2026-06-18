import {
  ArchiveIcon,
  CheckCircledIcon,
  ClipboardCopyIcon,
  CrossCircledIcon,
  DownloadIcon,
  FileTextIcon,
  GearIcon,
  GlobeIcon,
  PlayIcon,
  ReloadIcon,
  UploadIcon,
} from '@radix-ui/react-icons';
import type { ChangeEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  convertSingle,
  createJob,
  getCapabilities,
  getDefaults,
  getJob,
  type CapabilitiesResponse,
  type ConversionResult,
  type DefaultsResponse,
  type EffectProfile,
  type FvttVersion,
  type JobStatus,
  type JobType,
  type WebJob,
} from './api';

type ToolId = 'single' | JobType;

interface ToolConfig {
  id: ToolId;
  title: string;
  short: string;
  description: string;
  accepts: string;
  needsFile: boolean;
}

const tools: ToolConfig[] = [
  {
    id: 'single',
    title: '单文件转换',
    short: '单文件',
    description: '上传一个 Actor 或 Item Markdown，直接生成 JSON 并下载。',
    accepts: '.md,.markdown,.txt',
    needsFile: true,
  },
  {
    id: 'monster-collection',
    title: '怪物合集',
    short: '怪物合集',
    description: '上传包含多个怪物条目的 Markdown，逐条生成 Actor JSON。',
    accepts: '.md,.markdown,.txt',
    needsFile: true,
  },
  {
    id: 'item-collection',
    title: '物品合集',
    short: '物品合集',
    description: '上传包含多个物品条目的 Markdown，逐条生成 Item JSON。',
    accepts: '.md,.markdown,.txt',
    needsFile: true,
  },
  {
    id: 'ingest-plaintext-actors',
    title: 'Plaintext 生成 Actor',
    short: 'Plaintext Actor',
    description: '上传站点整理文本，先拆成项目 Markdown，再同步生成 Actor JSON。',
    accepts: '.md,.markdown,.txt',
    needsFile: true,
  },
  {
    id: 'ingest-plaintext',
    title: 'Plaintext 拆分',
    short: 'Plaintext',
    description: '只拆分 plaintext 到项目 Markdown，不生成 Foundry JSON。',
    accepts: '.md,.markdown,.txt',
    needsFile: true,
  },
  {
    id: 'ingest-items',
    title: '物品 Markdown 拆分',
    short: '物品拆分',
    description: '把物品合集拆成项目可读的单个物品 Markdown。',
    accepts: '.md,.markdown,.txt',
    needsFile: true,
  },
  {
    id: 'records-to-plaintext',
    title: 'records 转 plaintext',
    short: 'Records',
    description: '上传 Goddess Fantasy crawl 的 records.json，转换为 plaintext Markdown。',
    accepts: '.json',
    needsFile: true,
  },
  {
    id: 'translate-json',
    title: 'JSON 翻译',
    short: '翻译',
    description: '上传 JSON，由 VPS 环境变量中的翻译服务配置执行翻译。',
    accepts: '.json',
    needsFile: true,
  },
  {
    id: 'goddessfantasy-board-crawl',
    title: 'Goddess Fantasy 爬站',
    short: '爬站',
    description: '输入版块 URL，使用 VPS 环境变量里的 cookie 或登录配置抓取 records。',
    accepts: '',
    needsFile: false,
  },
  {
    id: 'vault-sync',
    title: 'Vault Sync',
    short: 'Vault',
    description: '同步服务器本地 vault/input 到 vault/output，适合自用 VPS 维护任务。',
    accepts: '',
    needsFile: false,
  },
];

const terminalStatuses: JobStatus[] = ['succeeded', 'partial', 'failed'];

export function App() {
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(null);
  const [defaults, setDefaults] = useState<DefaultsResponse | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>('single');
  const [fileName, setFileName] = useState('uploaded.md');
  const [content, setContent] = useState('');
  const [fvttVersion, setFvttVersion] = useState<FvttVersion>('12');
  const [effectProfile, setEffectProfile] = useState<EffectProfile>('core');
  const [boardUrl, setBoardUrl] = useState('');
  const [vaultPath, setVaultPath] = useState('');
  const [enableAiNormalize, setEnableAiNormalize] = useState(false);
  const [clearBackup, setClearBackup] = useState(false);
  const [singleResult, setSingleResult] = useState<ConversionResult | null>(null);
  const [job, setJob] = useState<WebJob | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [mobileTab, setMobileTab] = useState<'input' | 'result' | 'log'>('input');
  const pollRef = useRef<number | null>(null);

  const tool = tools.find((item) => item.id === activeTool) ?? tools[0]!;
  const uploadLimitMb = activeTool === 'single'
    ? capabilities?.limits.singleUploadMb ?? 5
    : capabilities?.limits.collectionUploadMb ?? 20;

  useEffect(() => {
    Promise.all([getCapabilities(), getDefaults()])
      .then(([nextCapabilities, nextDefaults]) => {
        setCapabilities(nextCapabilities);
        setDefaults(nextDefaults);
        setFvttVersion(nextDefaults.fvttVersion);
        setEffectProfile(nextDefaults.effectProfile);
        setVaultPath(nextDefaults.vaultPath);
      })
      .catch((nextError: Error) => {
        setStatus('error');
        setError(nextError.message);
      });
  }, []);

  useEffect(() => {
    if (!job || terminalStatuses.includes(job.status)) return;
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const nextJob = await getJob(job.id);
        setJob(nextJob);
        if (terminalStatuses.includes(nextJob.status)) {
          setStatus(nextJob.status === 'failed' ? 'error' : 'success');
          setMobileTab('result');
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
      } catch (nextError) {
        setStatus('error');
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    }, 900);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [job]);

  const jsonPreview = useMemo(() => {
    if (singleResult) return JSON.stringify(singleResult.rawJson, null, 2);
    if (job?.summary) return JSON.stringify(job.summary, null, 2);
    return '{\n  "state": "等待上传或启动任务"\n}';
  }, [job?.summary, singleResult]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!isAcceptedFile(file.name, tool.accepts)) {
      setStatus('error');
      setError(`文件类型不匹配：当前工具接受 ${tool.accepts || '无文件输入'}`);
      return;
    }
    if (file.size > uploadLimitMb * 1024 * 1024) {
      setStatus('error');
      setError(`文件超过 ${uploadLimitMb} MB 限制。`);
      return;
    }
    setFileName(file.name);
    setContent(await file.text());
    setSingleResult(null);
    setJob(null);
    setError('');
    setStatus('idle');
  }

  async function runCurrentTool() {
    setStatus('loading');
    setError('');
    setSingleResult(null);
    setJob(null);

    try {
      if (activeTool === 'single') {
        const result = await convertSingle({
          fileName,
          content,
          fvttVersion,
          effectProfile,
        });
        setSingleResult(result);
        setStatus('success');
        setMobileTab('result');
        return;
      }

      const nextJob = await createJob({
        type: activeTool,
        fileName,
        content: tool.needsFile ? content : undefined,
        options: {
          fvttVersion,
          effectProfile,
          boardUrl,
          vaultPath,
          enableAiNormalize,
          clearBackup,
          contentType: 'monster',
        },
      });
      setJob(nextJob);
      setMobileTab('result');
    } catch (nextError) {
      setStatus('error');
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function copyPreview() {
    await navigator.clipboard.writeText(jsonPreview);
  }

  const canRun = activeTool === 'goddessfantasy-board-crawl'
    ? Boolean(boardUrl.trim())
    : activeTool === 'vault-sync'
      ? Boolean(vaultPath.trim())
      : Boolean(content.trim());

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">fvttV12Json Web 工作台</p>
          <h1>上传 Markdown，生成 Foundry JSON</h1>
        </div>
        <StatusBadge status={status} jobStatus={job?.status} />
      </header>

      <section className="capability-strip">
        <Capability label="访问" value={capabilities?.publicAccess ? '公网开放' : '本地'} tone="warning" />
        <Capability label="翻译" value={capabilities?.translationConfigured ? '已配置' : '未配置'} />
        <Capability label="爬站凭据" value={capabilities?.goddessFantasyCookieConfigured || capabilities?.goddessFantasyLoginConfigured ? '已配置' : '未配置'} />
        <Capability label="上传限制" value={`${uploadLimitMb} MB`} />
      </section>

      <nav className="mobile-tabs" aria-label="移动端面板">
        <button className={mobileTab === 'input' ? 'is-active' : ''} onClick={() => setMobileTab('input')}>输入</button>
        <button className={mobileTab === 'result' ? 'is-active' : ''} onClick={() => setMobileTab('result')}>结果</button>
        <button className={mobileTab === 'log' ? 'is-active' : ''} onClick={() => setMobileTab('log')}>日志</button>
      </nav>

      <section className="workbench-grid">
        <aside className={`panel tool-panel ${mobileTab === 'input' ? 'mobile-active' : ''}`}>
          <PanelTitle icon={<GearIcon />} title="工具" detail="选择要运行的 CLI 能力" />
          <div className="tool-list">
            {tools.map((item) => (
              <button
                key={item.id}
                className={activeTool === item.id ? 'is-active' : ''}
                onClick={() => {
                  setActiveTool(item.id);
                  setSingleResult(null);
                  setJob(null);
                  setError('');
                  if (item.accepts === '.json' && !fileName.endsWith('.json')) setFileName('uploaded.json');
                  if (item.accepts !== '.json' && fileName.endsWith('.json')) setFileName('uploaded.md');
                }}
              >
                <span>{item.short}</span>
                <small>{item.title}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className={`panel input-panel ${mobileTab === 'input' ? 'mobile-active' : ''}`}>
          <PanelTitle icon={<UploadIcon />} title={tool.title} detail={tool.description} />

          {tool.needsFile ? (
            <label className="drop-zone">
              <input type="file" accept={tool.accepts} onChange={handleFileChange} />
              <UploadIcon />
              <strong>选择文件或把内容粘贴到下方</strong>
              <span>{fileName}</span>
            </label>
          ) : null}

          {tool.needsFile ? (
            <label className="field">
              <span>文件名</span>
              <input value={fileName} onChange={(event) => setFileName(event.target.value)} />
            </label>
          ) : null}

          {tool.needsFile ? (
            <label className="field">
              <span>内容</span>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={tool.accepts === '.json' ? '粘贴 JSON 内容' : '粘贴 Markdown 内容'}
              />
            </label>
          ) : null}

          {activeTool === 'goddessfantasy-board-crawl' ? (
            <label className="field">
              <span>Board URL</span>
              <input value={boardUrl} onChange={(event) => setBoardUrl(event.target.value)} placeholder="https://goddessfantasy.net/..." />
            </label>
          ) : null}

          {activeTool === 'vault-sync' ? (
            <label className="field">
              <span>Vault 路径</span>
              <input value={vaultPath} onChange={(event) => setVaultPath(event.target.value)} placeholder={defaults?.vaultPath || 'obsidian/dnd数据转fvttjson'} />
            </label>
          ) : null}

          <div className="options-grid">
            <label>
              <span>Foundry</span>
              <select value={fvttVersion} onChange={(event) => setFvttVersion(event.target.value as FvttVersion)}>
                <option value="12">v12</option>
                <option value="13">v13</option>
              </select>
            </label>
            <label>
              <span>Effect Profile</span>
              <select value={effectProfile} onChange={(event) => setEffectProfile(event.target.value as EffectProfile)}>
                <option value="core">core</option>
                <option value="modded-v12">modded-v12</option>
              </select>
            </label>
          </div>

          <div className="checkbox-row">
            <label>
              <input type="checkbox" checked={enableAiNormalize} onChange={(event) => setEnableAiNormalize(event.target.checked)} />
              AI normalize
            </label>
            <label>
              <input type="checkbox" checked={clearBackup} onChange={(event) => setClearBackup(event.target.checked)} />
              clear backup
            </label>
          </div>

          <button className="primary-button" disabled={!canRun || status === 'loading'} onClick={runCurrentTool}>
            {status === 'loading' ? <ReloadIcon className="spin" /> : <PlayIcon />}
            运行
          </button>
        </section>

        <section className={`panel result-panel ${mobileTab === 'result' ? 'mobile-active' : ''}`}>
          <PanelTitle
            icon={<FileTextIcon />}
            title="结果"
            detail={resultDetail(singleResult, job)}
            actions={
              <button onClick={copyPreview} disabled={!singleResult && !job?.summary}>
                <ClipboardCopyIcon />
                复制预览
              </button>
            }
          />

          {error ? (
            <div className="error-box">
              <CrossCircledIcon />
              <span>{error}</span>
            </div>
          ) : null}

          {job ? <Progress job={job} /> : null}

          <DownloadPanel singleResult={singleResult} job={job} />

          <pre className="json-preview">{jsonPreview}</pre>
        </section>

        <aside className={`panel inspector-panel ${mobileTab === 'log' ? 'mobile-active' : ''}`}>
          <PanelTitle icon={<ArchiveIcon />} title="日志与警告" detail="任务状态、warnings、失败条目" />
          <Warnings singleResult={singleResult} job={job} />
          <RunLog job={job} />
        </aside>
      </section>
    </main>
  );
}

function DownloadPanel(props: { singleResult: ConversionResult | null; job: WebJob | null }) {
  if (props.singleResult) {
    return (
      <div className="download-list">
        <a className="download-row" href={props.singleResult.downloadUrl}>
          <DownloadIcon />
          <span>{downloadNameForSingle(props.singleResult)}</span>
          <strong>下载 JSON</strong>
        </a>
      </div>
    );
  }

  if (!props.job) {
    return <div className="empty-state">运行后会在这里显示 JSON、Markdown、records 和 ZIP 下载。</div>;
  }

  return (
    <div className="download-list">
      {props.job.files.length > 1 ? (
        <a className="download-row is-zip" href={`/api/jobs/${props.job.id}/download.zip`}>
          <ArchiveIcon />
          <span>全部产物</span>
          <strong>下载 ZIP</strong>
        </a>
      ) : null}
      {props.job.files.map((file) => (
        <a className="download-row" href={file.downloadUrl} key={file.id}>
          <DownloadIcon />
          <span>{file.label || file.fileName}</span>
          <strong>{formatBytes(file.size)}</strong>
        </a>
      ))}
    </div>
  );
}

function Warnings(props: { singleResult: ConversionResult | null; job: WebJob | null }) {
  const warnings = props.singleResult?.warnings ?? props.job?.warnings ?? [];
  const failures = props.job?.failures ?? [];
  return (
    <div className="warning-stack">
      {warnings.length === 0 && failures.length === 0 ? <div className="success-box">暂无 warning 或失败条目。</div> : null}
      {warnings.map((warning, index) => (
        <div className="warning-row" key={`${warning}-${index}`}>{warning}</div>
      ))}
      {failures.map((failure, index) => (
        <div className="failure-row" key={`${failure.error}-${index}`}>
          <strong>{failure.sourceName ?? failure.file ?? `#${failure.index ?? index + 1}`}</strong>
          <span>{failure.error}</span>
        </div>
      ))}
    </div>
  );
}

function RunLog(props: { job: WebJob | null }) {
  const rows = props.job?.logs ?? [];
  return (
    <div className="log-list">
      {rows.length === 0 ? <div className="empty-state">暂无运行日志。</div> : null}
      {[...rows].reverse().map((entry) => (
        <div className={`log-row ${entry.level}`} key={`${entry.at}-${entry.message}`}>
          <span>{new Date(entry.at).toLocaleTimeString()}</span>
          <strong>{entry.level}</strong>
          <p>{entry.message}</p>
        </div>
      ))}
    </div>
  );
}

function Progress(props: { job: WebJob }) {
  const progress = props.job.progress.total <= 0 ? 0 : Math.round((props.job.progress.current / props.job.progress.total) * 100);
  return (
    <div className="progress-box">
      <div>
        <span>{statusLabel(props.job.status)}</span>
        <strong>{props.job.progress.label}</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: `${Math.max(8, progress)}%` }} />
      </div>
    </div>
  );
}

function Capability(props: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div className={`capability ${props.tone ?? ''}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function PanelTitle(props: { icon?: ReactNode; title: string; detail?: string; actions?: ReactNode }) {
  return (
    <div className="panel-title">
      <div className="panel-heading">
        <div>
          {props.icon}
          <h2>{props.title}</h2>
        </div>
        {props.actions}
      </div>
      {props.detail ? <p>{props.detail}</p> : null}
    </div>
  );
}

function StatusBadge(props: { status: 'idle' | 'loading' | 'success' | 'error'; jobStatus?: JobStatus }) {
  return (
    <div className={`status-badge ${props.status}`}>
      {props.status === 'loading' ? <ReloadIcon className="spin" /> : props.status === 'success' ? <CheckCircledIcon /> : props.status === 'error' ? <CrossCircledIcon /> : <GlobeIcon />}
      {props.jobStatus ? statusLabel(props.jobStatus) : statusLabel(props.status)}
    </div>
  );
}

function resultDetail(singleResult: ConversionResult | null, job: WebJob | null): string {
  if (singleResult) return `${singleResult.name || '未命名'} · ${singleResult.kind}`;
  if (job) return `${job.type} · ${statusLabel(job.status)}`;
  return '等待运行';
}

function statusLabel(status: JobStatus | 'idle' | 'loading' | 'success' | 'error'): string {
  switch (status) {
    case 'queued':
      return '排队中';
    case 'running':
    case 'loading':
      return '处理中';
    case 'succeeded':
    case 'success':
      return '已完成';
    case 'partial':
      return '部分完成';
    case 'failed':
    case 'error':
      return '失败';
    default:
      return '待运行';
  }
}

function isAcceptedFile(fileName: string, accepts: string): boolean {
  if (!accepts) return true;
  const extensions = accepts.split(',').map((item) => item.trim().replace(/^\*/, '').toLowerCase());
  const lower = fileName.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}

function downloadNameForSingle(result: ConversionResult): string {
  return `${(result.name || 'foundry-json').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')}.json`;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
