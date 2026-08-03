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
  hasCompleteNormalizedCropRect,
  type ImageTokenCrop as TokenCrop,
} from '../../../../src/core/application/web-client';
import {
  convertSingle,
  createDocumentJob,
  createJob,
  getCapabilities,
  getDefaults,
  getJob,
  submitIntakeDecisions,
  type CapabilitiesResponse,
  type ConversionResult,
  type DefaultsResponse,
  type EffectProfile,
  type FvttVersion,
  type IconMode,
  type JobStatus,
  type JobType,
  type WebJob,
} from './api';
import {
  createDecisionDraft,
  describePortableSpellResolution,
  intakeActorDownloadLabel,
  isReviewFindingActionable,
  type IntakeDecisionDraft,
  type PortableSpellResolutionLike,
} from './intakeReview';

type ToolId = 'single' | JobType;
type ToolGroupId = 'intake' | 'json' | 'legacy' | 'crawler';
type CrawlMode = 'full' | 'incremental';

interface ToolConfig {
  id: ToolId;
  group: ToolGroupId;
  title: string;
  short: string;
  description: string;
  accepts: string;
  needsFile: boolean;
  supportsImageAssets?: boolean;
}

const tools: ToolConfig[] = [
  {
    id: 'document-convert',
    group: 'json',
    title: '图片 / PDF 转 Actor',
    short: '图片 / PDF',
    description: '先提取原文和版面，再筛选 NPC/怪物，最后翻译候选并生成 Actor JSON。',
    accepts: '.pdf,.png,.jpg,.jpeg,.webp',
    needsFile: true,
  },
  {
    id: 'ai-monster-intake',
    group: 'intake',
    title: 'AI 怪物资料整理',
    short: 'AI Intake',
    description: '推荐入口：上传或粘贴 TXT / 乱 Markdown，经证据化提取、项目生成器与独立终审生成便携 Actor JSON。施法者的法术会在导入目标世界后由 FVTT v14 解析模块完成解析。文本会发送到服务器配置的 AI provider。',
    accepts: '.md,.markdown,.txt',
    needsFile: true,
  },
  {
    id: 'single',
    group: 'json',
    title: '单文件转换',
    short: '单文件',
    description: '上传一个 Actor 或 Item Markdown，直接生成 JSON 并下载。',
    accepts: '.md,.markdown,.txt',
    needsFile: true,
  },
  {
    id: 'monster-collection',
    group: 'json',
    title: '怪物合集',
    short: '怪物合集',
    description: '上传包含多个怪物条目的 Markdown，逐条生成 Actor JSON。',
    accepts: '.md,.markdown,.txt',
    needsFile: true,
  },
  {
    id: 'item-collection',
    group: 'json',
    title: '物品合集',
    short: '物品合集',
    description: '上传包含多个物品条目的 Markdown，逐条生成 Item JSON。',
    accepts: '.md,.markdown,.txt',
    needsFile: true,
  },
  {
    id: 'ingest-plaintext-actors',
    group: 'legacy',
    title: 'Legacy Plaintext 生成 Actor',
    short: 'Plaintext Actor',
    description: '上传站点整理文本，先拆成项目 Markdown，再同步生成 Actor JSON。',
    accepts: '.md,.markdown,.txt',
    needsFile: true,
    supportsImageAssets: true,
  },
  {
    id: 'ingest-plaintext',
    group: 'legacy',
    title: 'Legacy Plaintext 拆分',
    short: 'Plaintext',
    description: '只拆分 plaintext 到项目 Markdown，不生成 Foundry JSON。',
    accepts: '.md,.markdown,.txt',
    needsFile: true,
  },
  {
    id: 'ingest-items',
    group: 'crawler',
    title: '物品 Markdown 拆分',
    short: '物品拆分',
    description: '把物品合集拆成项目可读的单个物品 Markdown。',
    accepts: '.md,.markdown,.txt',
    needsFile: true,
  },
  {
    id: 'records-to-plaintext',
    group: 'crawler',
    title: 'records 转 plaintext',
    short: 'Records',
    description: '上传 Goddess Fantasy crawl 的 records.json，转换为 plaintext Markdown。',
    accepts: '.json',
    needsFile: true,
  },
  {
    id: 'translate-json',
    group: 'crawler',
    title: 'JSON 翻译',
    short: '翻译',
    description: '上传 JSON，由 VPS 环境变量中的翻译服务配置执行翻译。',
    accepts: '.json',
    needsFile: true,
  },
  {
    id: 'goddessfantasy-board-crawl',
    group: 'crawler',
    title: 'Goddess Fantasy 爬站',
    short: '爬站',
    description: '输入版块 URL，使用 VPS 环境变量里的 cookie 或登录配置抓取 records。',
    accepts: '',
    needsFile: false,
  },
  {
    id: 'vault-sync',
    group: 'json',
    title: 'Vault Sync',
    short: 'Vault',
    description: '同步服务器本地 vault/input 到 vault/output，适合自用 VPS 维护任务。',
    accepts: '',
    needsFile: false,
    supportsImageAssets: true,
  },
];

const toolGroups: Array<{ id: ToolGroupId; title: string; detail: string }> = [
  { id: 'intake', title: '推荐', detail: 'AI 主导、证据化、可复核' },
  { id: 'json', title: '生成 JSON', detail: 'Actor / Item / Vault 输出' },
  { id: 'legacy', title: 'Legacy', detail: '旧规则转换，仅兼容历史流程' },
  { id: 'crawler', title: '爬虫与整理', detail: '抓取、拆分、翻译' },
];

const terminalStatuses: JobStatus[] = ['succeeded', 'needs_review', 'partial', 'failed'];
const goddessFantasyBoardUrl = 'https://www.goddessfantasy.net/bbs/index.php?board=2318.0';

export function App() {
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(null);
  const [defaults, setDefaults] = useState<DefaultsResponse | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>('single');
  const [fileName, setFileName] = useState('uploaded.md');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [content, setContent] = useState('');
  const [documentCandidateText, setDocumentCandidateText] = useState('');
  const [documentExtractOnly, setDocumentExtractOnly] = useState(false);
  const [fvttVersion, setFvttVersion] = useState<FvttVersion>('12');
  const [effectProfile, setEffectProfile] = useState<EffectProfile>('core');
  const [iconMode, setIconMode] = useState<IconMode>('off');
  const [boardUrl, setBoardUrl] = useState(goddessFantasyBoardUrl);
  const [vaultPath, setVaultPath] = useState('');
  const [enableAiNormalize, setEnableAiNormalize] = useState(false);
  const [clearBackup, setClearBackup] = useState(false);
  const [imageAssetsEnabled, setImageAssetsEnabled] = useState(false);
  const [imageTokenCropsText, setImageTokenCropsText] = useState('');
  const [singleResult, setSingleResult] = useState<ConversionResult | null>(null);
  const [job, setJob] = useState<WebJob | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [mobileTab, setMobileTab] = useState<'input' | 'result' | 'log'>('input');
  const pollRef = useRef<number | null>(null);

  const tool = tools.find((item) => item.id === activeTool) ?? tools[0]!;
  const supportsImageAssets = Boolean(tool.supportsImageAssets);
  const supportsAiNormalize = ['ingest-plaintext', 'ingest-plaintext-actors', 'vault-sync'].includes(activeTool);
  const supportsClearBackup = activeTool === 'vault-sync';
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
        setIconMode(nextDefaults.iconMode);
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

  useEffect(() => {
    if (!supportsImageAssets && imageAssetsEnabled) {
      setImageAssetsEnabled(false);
    }
  }, [imageAssetsEnabled, supportsImageAssets]);

  useEffect(() => {
    if (activeTool === 'ai-monster-intake' && fvttVersion === '13') setFvttVersion('12');
  }, [activeTool, fvttVersion]);

  useEffect(() => {
    if (fvttVersion !== '14' && iconMode !== 'off') setIconMode('off');
  }, [fvttVersion, iconMode]);

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
    setSelectedFile(file);
    setContent(activeTool === 'document-convert' ? '' : await file.text());
    if (activeTool === 'document-convert') setDocumentCandidateText('');
    setSingleResult(null);
    setJob(null);
    setError('');
    setStatus('idle');
  }

  async function runCurrentTool(crawlMode?: CrawlMode) {
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
          iconMode,
        });
        setSingleResult(result);
        setStatus('success');
        setMobileTab('result');
        return;
      }

      if (activeTool === 'document-convert') {
        if (!selectedFile) throw new Error('请先选择 PDF 或图片文件。');
        const nextJob = await createDocumentJob({
          file: selectedFile,
          fvttVersion,
          effectProfile,
          iconMode,
          candidateIds: documentCandidateText.split(',').map((item) => item.trim()).filter(Boolean),
          extractOnly: documentExtractOnly,
        });
        setJob(nextJob);
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
          iconMode,
          boardUrl,
          crawlMode,
          vaultPath,
          enableAiNormalize,
          clearBackup,
          contentType: 'monster',
          imageAssetsEnabled: supportsImageAssets && imageAssetsEnabled,
          imageTokenCrops: supportsImageAssets && imageAssetsEnabled
            ? parseImageTokenCrops(imageTokenCropsText)
            : undefined,
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

  const canRun = activeTool === 'document-convert'
    ? Boolean(selectedFile)
    : activeTool === 'goddessfantasy-board-crawl'
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
        <Capability label="AI Intake" value={capabilities?.monsterIntakeConfigured ? (capabilities.monsterIntakeAuthMode === 'codex-oauth' ? 'Codex OAuth' : 'API Key') : '未配置'} tone={capabilities?.monsterIntakeConfigured ? undefined : 'warning'} />
        <Capability label="爬站凭据" value={capabilities?.goddessFantasyCookieConfigured || capabilities?.goddessFantasyLoginConfigured ? '已配置' : '未配置'} />
        <Capability label="图片资产" value={capabilities?.imageAssetsConfigured ? '已配置' : '未配置'} tone={capabilities?.imageAllowHttp ? 'warning' : undefined} />
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
            {toolGroups.map((group) => (
              <div className="tool-group" key={group.id}>
                <div className="tool-group-title">
                  <strong>{group.title}</strong>
                  <span>{group.detail}</span>
                </div>
                {tools.filter((item) => item.group === group.id).map((item) => (
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
                    {item.supportsImageAssets ? <em>图片子工具</em> : null}
                  </button>
                ))}
              </div>
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

          {activeTool === 'document-convert' ? (
            <>
              <label className="field">
                <span>候选 ID（可选，逗号分隔；也可以在结果区勾选）</span>
                <input value={documentCandidateText} onChange={(event) => setDocumentCandidateText(event.target.value)} placeholder="例如 p20-beholder-hivemother-p20-block1" />
              </label>
              <div className="checkbox-row">
                <label>
                  <input type="checkbox" checked={documentExtractOnly} onChange={(event) => setDocumentExtractOnly(event.target.checked)} />
                  只提取和筛选，不翻译、不生成 JSON
                </label>
              </div>
            </>
          ) : null}

          {tool.needsFile && activeTool !== 'document-convert' ? (
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
                {activeTool !== 'ai-monster-intake' ? <option value="13">v13</option> : null}
                <option value="14">v14</option>
              </select>
            </label>
            <label>
              <span>Effect Profile</span>
              <select value={effectProfile} onChange={(event) => setEffectProfile(event.target.value as EffectProfile)}>
                <option value="core">core</option>
                <option value="modded-v12">modded-v12</option>
                <option value="modded-v14">modded-v14</option>
              </select>
            </label>
          </div>

          {fvttVersion === '14' ? (
            <div className="checkbox-row">
              <label>
                <input
                  type="checkbox"
                  checked={iconMode === 'safe'}
                  onChange={(event) => setIconMode(event.target.checked ? 'safe' : 'off')}
                />
                安全匹配特性图标
              </label>
            </div>
          ) : null}

          {supportsAiNormalize || supportsClearBackup ? (
            <div className="checkbox-row">
              {supportsAiNormalize ? (
                <label>
                  <input type="checkbox" checked={enableAiNormalize} onChange={(event) => setEnableAiNormalize(event.target.checked)} />
                  AI normalize
                </label>
              ) : null}
              {supportsClearBackup ? (
                <label>
                  <input type="checkbox" checked={clearBackup} onChange={(event) => setClearBackup(event.target.checked)} />
                  clear backup
                </label>
              ) : null}
            </div>
          ) : null}

          {supportsImageAssets ? (
            <ImageAssetsPanel
              capabilities={capabilities}
              enabled={imageAssetsEnabled}
              tokenCropsText={imageTokenCropsText}
              onEnabledChange={setImageAssetsEnabled}
              onTokenCropsTextChange={setImageTokenCropsText}
            />
          ) : null}

          {activeTool === 'goddessfantasy-board-crawl' ? (
            <div className="crawl-action-row">
              <button className="secondary-button" disabled={!canRun || status === 'loading'} onClick={() => runCurrentTool('full')}>
                {status === 'loading' ? <ReloadIcon className="spin" /> : <ReloadIcon />}
                完全重爬
              </button>
              <button className="primary-button" disabled={!canRun || status === 'loading'} onClick={() => runCurrentTool('incremental')}>
                {status === 'loading' ? <ReloadIcon className="spin" /> : <PlayIcon />}
                增量爬虫
              </button>
            </div>
          ) : (
            <button className="primary-button" disabled={!canRun || status === 'loading'} onClick={() => runCurrentTool()}>
              {status === 'loading' ? <ReloadIcon className="spin" /> : <PlayIcon />}
              运行
            </button>
          )}
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

          <CrawlSummary job={job} />

          <ImageAssetSummary capabilities={capabilities} job={job} />

          <IntakeReviewPanel
            job={job}
            onResumed={(nextJob) => {
              setJob(nextJob);
              setStatus('loading');
              setError('');
            }}
            onError={(message) => {
              setStatus('error');
              setError(message);
            }}
          />

          <DocumentCandidatesPanel
            job={job}
            selectedIds={documentCandidateText.split(',').map((item) => item.trim()).filter(Boolean)}
            onSelectionChange={(ids) => setDocumentCandidateText(ids.join(','))}
          />

          <DocumentPreviewPanel job={job} />

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

interface IntakeReviewFinding {
  id: string;
  code: string;
  path: string;
  message: string;
  blocking: boolean;
  origin?: string;
  candidates?: unknown[];
  evidence?: Array<{ start: number; end: number; quote: string }>;
}

interface IntakeReviewCreature {
  id: string;
  label: string;
  status: string;
  findings: IntakeReviewFinding[];
  spellResolution?: PortableSpellResolutionLike;
}

function DocumentCandidatesPanel(props: {
  job: WebJob | null;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  if (props.job?.type !== 'document-convert') return null;
  const candidates = Array.isArray(props.job.summary?.candidates)
    ? props.job.summary.candidates as Array<{ id: string; label: string; pageNumber: number; status: string; confidence: number; reason?: string }>
    : [];
  const pageCount = typeof props.job.summary?.pageCount === 'number' ? props.job.summary.pageCount : undefined;
  return (
    <section className="intake-review">
      <h3>文档候选{pageCount !== undefined ? ` · ${pageCount} 页` : ''}</h3>
      {candidates.length === 0 ? <p>候选清单将在提取阶段后显示。</p> : null}
      {candidates.map((candidate) => (
        <article key={candidate.id}>
          <header>
            <label>
              <input
                type="checkbox"
                disabled={candidate.status !== 'high'}
                checked={props.selectedIds.length === 0 ? candidate.status === 'high' : props.selectedIds.includes(candidate.id)}
                onChange={(event) => {
                  const base = props.selectedIds.length === 0
                    ? candidates.filter((item) => item.status === 'high').map((item) => item.id)
                    : props.selectedIds;
                  const next = event.target.checked
                    ? [...new Set([...base, candidate.id])]
                    : base.filter((id) => id !== candidate.id);
                  props.onSelectionChange(next);
                }}
              />
              <strong>{candidate.label}</strong>
            </label>
            <span>第 {candidate.pageNumber} 页 · {candidate.status}</span>
          </header>
          <p><code>{candidate.id}</code> · 置信度 {(candidate.confidence * 100).toFixed(0)}%</p>
          {candidate.reason ? <p>{candidate.reason}</p> : null}
        </article>
      ))}
    </section>
  );
}

function DocumentPreviewPanel(props: { job: WebJob | null }) {
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    if (props.job?.type !== 'document-convert' || !terminalStatuses.includes(props.job.status)) {
      setPreviews({});
      return;
    }
    const markdownFiles = props.job.files.filter((file) => file.fileName.endsWith('.md'));
    let cancelled = false;
    Promise.all(markdownFiles.map(async (file) => [file.fileName, await fetch(file.downloadUrl).then((response) => response.text())] as const))
      .then((entries) => {
        if (!cancelled) setPreviews(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setPreviews({});
      });
    return () => {
      cancelled = true;
    };
  }, [props.job?.id, props.job?.status, props.job?.files]);

  if (props.job?.type !== 'document-convert' || Object.keys(previews).length === 0) return null;
  return (
    <section className="document-preview-panel">
      <h3>Markdown 预览</h3>
      {Object.entries(previews).map(([fileName, content]) => (
        <details key={fileName} open={fileName === 'raw-extracted.md' || fileName === 'translated.md'}>
          <summary>{fileName}</summary>
          <pre className="document-preview">{content.slice(0, 30_000)}</pre>
        </details>
      ))}
    </section>
  );
}

function IntakeReviewPanel(props: {
  job: WebJob | null;
  onResumed: (job: WebJob) => void;
  onError: (message: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, IntakeDecisionDraft>>({});
  const [submitting, setSubmitting] = useState(false);
  const creatures = props.job?.type === 'ai-monster-intake' && Array.isArray(props.job.summary?.creatures)
    ? props.job.summary.creatures as unknown as IntakeReviewCreature[]
    : [];
  const findings = creatures.flatMap((creature) => (creature.findings ?? []).filter((finding) => finding.blocking).map((finding) => ({ creature, finding })));
  const allFindingsActionable = findings.every(({ finding }) => isReviewFindingActionable(finding));

  useEffect(() => {
    if (!props.job || props.job.status !== 'needs_review') return;
    setDrafts(Object.fromEntries(findings.map(({ finding }) => [finding.id, createDecisionDraft(finding)])));
  }, [props.job?.id, props.job?.status]);

  if (!props.job || props.job.type !== 'ai-monster-intake') return null;
  if (creatures.length === 0) return null;

  async function submit() {
    if (!props.job) return;
    if (!allFindingsActionable) {
      props.onError('当前问题不能通过人工设值安全修复，请修改原文或重新运行 AI 提取。');
      return;
    }
    setSubmitting(true);
    try {
      const decisions = findings.map(({ finding }) => {
        const draft = drafts[finding.id] ?? createDecisionDraft(finding);
        if (draft.action === 'unresolved') throw new Error(`问题 ${finding.id} 尚未选择可执行决定。`);
        const requiresValue = draft.action === 'select' || draft.action === 'set';
        return {
          issueId: finding.id,
          action: draft.action,
          value: requiresValue ? parseDecisionValue(draft.value) : undefined,
        };
      });
      props.onResumed(await submitIntakeDecisions(props.job.id, decisions));
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="intake-review">
      <h3>AI Intake 逐怪物审查</h3>
      {creatures.map((creature) => (
        <article key={creature.id}>
          <header><strong>{creature.label}</strong><span>{statusLabel(creature.status as JobStatus | 'accepted')}</span></header>
          {describePortableSpellResolution(creature.spellResolution) ? (
            <p className="intake-spell-status">{describePortableSpellResolution(creature.spellResolution)}</p>
          ) : null}
          {(creature.findings ?? []).filter((finding) => finding.blocking).map((finding) => {
            const draft = drafts[finding.id] ?? createDecisionDraft(finding);
            return (
              <div className="intake-issue" key={finding.id}>
                <div><code>{finding.code}</code><code>{finding.path}</code></div>
                <p>{finding.message}</p>
                {finding.evidence?.map((evidence) => <blockquote key={`${evidence.start}-${evidence.end}`}>{evidence.quote}</blockquote>)}
                {props.job?.status === 'needs_review' && isReviewFindingActionable(finding) ? (
                  <div className="intake-decision">
                    <select value={draft.action} onChange={(event) => setDrafts({ ...drafts, [finding.id]: { ...draft, action: event.target.value as typeof draft.action } })}>
                      <option value="select">选择候选</option>
                      <option value="set">手工设值</option>
                      <option value="preserve-literal">保留原文</option>
                      <option value="exclude">排除可选内容</option>
                    </select>
                    {draft.action === 'select' && finding.candidates?.length ? (
                      <select value={draft.value} onChange={(event) => setDrafts({ ...drafts, [finding.id]: { ...draft, value: event.target.value } })}>
                        {finding.candidates.map((candidate) => {
                          const value = stringifyDecisionValue(candidate);
                          return <option key={value} value={value}>{value}</option>;
                        })}
                      </select>
                    ) : null}
                    {draft.action === 'set' ? <input value={draft.value} onChange={(event) => setDrafts({ ...drafts, [finding.id]: { ...draft, value: event.target.value } })} placeholder="JSON 值或文本" /> : null}
                  </div>
                ) : props.job?.status === 'needs_review' ? (
                  <p className="intake-decision-note">该问题不能通过当前确认表单安全覆盖，请修改原文或重新运行提取。</p>
                ) : null}
              </div>
            );
          })}
        </article>
      ))}
      {props.job.status === 'needs_review' && findings.length > 0 && allFindingsActionable ? (
        <button className="primary-button" disabled={submitting} onClick={submit}>{submitting ? '正在重新验收…' : '提交确认并恢复任务'}</button>
      ) : null}
    </section>
  );
}

function stringifyDecisionValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function parseDecisionValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try { return JSON.parse(trimmed); } catch { return trimmed; }
}

function ImageAssetsPanel(props: {
  capabilities: CapabilitiesResponse | null;
  enabled: boolean;
  tokenCropsText: string;
  onEnabledChange: (value: boolean) => void;
  onTokenCropsTextChange: (value: string) => void;
}) {
  const capabilities = props.capabilities;
  return (
    <section className="image-assets-panel">
      <div className="image-assets-header">
        <label>
          <input
            type="checkbox"
            checked={props.enabled}
            onChange={(event) => props.onEnabledChange(event.target.checked)}
          />
          启用图片资产
        </label>
        <span className={capabilities?.imageAssetsConfigured ? 'ready' : 'not-ready'}>
          {capabilities?.imageAssetsConfigured ? '服务器预设可用' : '服务器预设未完整配置'}
        </span>
      </div>
      <div className="image-preset-grid">
        <PresetRow label="模式" value={capabilities?.imageMode ?? 'ssh'} />
        <PresetRow label="SSH" value={capabilities?.imageSshTarget ?? '未加载'} />
        <PresetRow label="远程根目录" value={capabilities?.imageRemoteRoot ?? '未加载'} />
        <PresetRow label="公网前缀" value={capabilities?.imagePublicBaseUrl ?? '未加载'} />
        <PresetRow label="Actor 目录" value={capabilities?.imageActorDir ?? 'actors'} />
        <PresetRow label="Token 目录" value={capabilities?.imageTokenDir ?? 'tokens'} />
        <PresetRow label="Token 框" value={capabilities?.imageTokenFrameConfigured ? '已找到' : '缺失'} />
        <PresetRow label="Token 输出" value={`${capabilities?.imageTokenSize ?? 1024}px ${capabilities?.imageTokenFormat ?? 'webp'}`} />
        <PresetRow label="HTTP" value={capabilities?.imageAllowHttp ? '允许' : '不允许'} />
      </div>
      <label className="field image-crop-field">
        <span>token-crops.json</span>
        <textarea
          value={props.tokenCropsText}
          onChange={(event) => props.onTokenCropsTextChange(event.target.value)}
          placeholder='{"a831ff8f":{"left":0,"top":0,"width":1,"height":0.44}}'
          disabled={!props.enabled}
        />
      </label>
      <p className="image-assets-note">
        没有源图的生物不会生成图片；图片下载、裁剪或上传失败只记录 warning，JSON 继续生成且不写坏的镜像 URL。
      </p>
    </section>
  );
}

function PresetRow(props: { label: string; value: string }) {
  return (
    <div className="preset-row">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function ImageAssetSummary(props: { capabilities: CapabilitiesResponse | null; job: WebJob | null }) {
  const summary = props.job?.summary;
  const imageMode = typeof summary?.imageMode === 'string' ? summary.imageMode : 'none';
  const imageWarnings = typeof summary?.imageWarnings === 'number' ? summary.imageWarnings : 0;
  const imagePublicBaseUrl = typeof summary?.imagePublicBaseUrl === 'string'
    ? summary.imagePublicBaseUrl
    : props.capabilities?.imagePublicBaseUrl;

  if (!props.job && !props.capabilities?.imageAssetsConfigured) return null;
  if (imageMode === 'none' && !props.capabilities?.imageAssetsConfigured) return null;

  return (
    <div className="image-summary">
      <div>
        <span>图片资产</span>
        <strong>{imageMode === 'ssh' ? '已接入 workflow' : '未启用'}</strong>
      </div>
      <div>
        <span>公网前缀</span>
        <strong>{imagePublicBaseUrl ?? '未配置'}</strong>
      </div>
      <div>
        <span>图片 warning</span>
        <strong>{imageWarnings}</strong>
      </div>
    </div>
  );
}

function CrawlSummary(props: { job: WebJob | null }) {
  if (props.job?.type !== 'goddessfantasy-board-crawl' || !props.job.summary) return null;
  const summary = props.job.summary;
  const mode = summary.mode === 'full' ? '完全重爬' : '增量爬虫';
  const newCount = Array.isArray(summary.newTopicIds) ? summary.newTopicIds.length : numberSummary(summary, 'topicsCrawled');
  const rows = [
    ['模式', mode],
    ['新增', newCount],
    ['复用', numberSummary(summary, 'topicsReused')],
    ['重爬', numberSummary(summary, 'topicsCrawled')],
    ['失败', numberSummary(summary, 'failures')],
    ['records', numberSummary(summary, 'recordsAfter')],
  ];

  return (
    <div className="crawl-summary">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function numberSummary(summary: Record<string, unknown>, key: string): number {
  const value = summary[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
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
  const job = props.job;

  return (
    <div className="download-list">
      {job.files.length > 1 ? (
        <a className="download-row is-zip" href={`/api/jobs/${job.id}/download.zip`}>
          <ArchiveIcon />
          <span>全部产物</span>
          <strong>下载 ZIP</strong>
        </a>
      ) : null}
      {job.files.map((file) => (
        <a className="download-row" href={file.downloadUrl} key={file.id}>
          <DownloadIcon />
          <span>{intakeDownloadLabel(job, file.fileName, file.label || file.fileName)}</span>
          <strong>{formatBytes(file.size)}</strong>
        </a>
      ))}
    </div>
  );
}

function intakeDownloadLabel(job: WebJob, fileName: string, label: string): string {
  if (job.type !== 'ai-monster-intake' || !fileName.endsWith('-actor.json')) return label;
  const creatures = Array.isArray(job.summary?.creatures) ? job.summary.creatures as unknown as IntakeReviewCreature[] : [];
  const creature = creatures.find((entry) => fileName === `${entry.id}-actor.json`);
  return intakeActorDownloadLabel(label, creature?.spellResolution);
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

export function statusLabel(status: JobStatus | 'accepted' | 'idle' | 'loading' | 'success' | 'error'): string {
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
    case 'needs_review':
      return '待人工确认';
    case 'accepted':
      return '已接受';
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

function parseImageTokenCrops(text: string): Record<string, TokenCrop> | undefined {
  if (!text.trim()) return undefined;

  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('token-crops.json 必须是一个对象。');
  }

  const result: Record<string, TokenCrop> = {};
  for (const [hash, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^[a-f0-9]{8}$/i.test(hash)) {
      throw new Error(`token-crops.json 的 key 必须是 8 位 hash：${hash}`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`token-crops.json 的 ${hash} 必须是 crop 对象。`);
    }
    const crop = value as Partial<TokenCrop>;
    for (const field of ['left', 'top', 'width', 'height'] as const) {
      const numberValue = crop[field];
      if (typeof numberValue !== 'number' || !Number.isFinite(numberValue) || numberValue < 0 || numberValue > 1) {
        throw new Error(`token-crops.json 的 ${hash}.${field} 必须是 0 到 1 的数字。`);
      }
    }
    if (!hasCompleteNormalizedCropRect(crop)) {
      throw new Error(`token-crops.json 的 ${hash} 必须是完整 crop 对象。`);
    }
    if (crop.width <= 0 || crop.height <= 0 || crop.left + crop.width > 1 || crop.top + crop.height > 1) {
      throw new Error(`token-crops.json 的 ${hash} 裁剪范围必须在图片内部。`);
    }
    if (crop.fit !== undefined && crop.fit !== 'cover' && crop.fit !== 'contain') {
      throw new Error(`token-crops.json 的 ${hash}.fit 必须是 cover 或 contain。`);
    }
    result[hash.toLowerCase()] = {
      left: crop.left,
      top: crop.top,
      width: crop.width,
      height: crop.height,
      fit: crop.fit,
    };
  }

  return result;
}
