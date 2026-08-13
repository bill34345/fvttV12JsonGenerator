import {
  ArchiveIcon,
  ArrowLeftIcon,
  CheckCircledIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardCopyIcon,
  ClockIcon,
  CrossCircledIcon,
  DashboardIcon,
  DownloadIcon,
  ExclamationTriangleIcon,
  FileTextIcon,
  GearIcon,
  GlobeIcon,
  Link2Icon,
  MagicWandIcon,
  MixerHorizontalIcon,
  PlayIcon,
  ReaderIcon,
  ReloadIcon,
  RocketIcon,
  UploadIcon,
} from "@radix-ui/react-icons";
import type {
  ChangeEvent,
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  hasCompleteNormalizedCropRect,
  type ImageTokenCrop as TokenCrop,
} from "../../../../src/core/application/web-client";
import {
  convertSingle,
  createDocumentJob,
  createJob,
  detectConversion,
  getCapabilities,
  getDefaults,
  getJob,
  submitIntakeDecisions,
  type CapabilitiesResponse,
  type AutomaticConversionDetection,
  type ConversionResult,
  type DefaultsResponse,
  type EffectProfile,
  type FvttVersion,
  type IconMode,
  type JobStatus,
  type JobType,
  type WebJob,
} from "./api";
import {
  createDecisionDraft,
  describePortableSpellResolution,
  intakeActorDownloadLabel,
  isReviewFindingActionable,
  type IntakeDecisionDraft,
  type PortableSpellResolutionLike,
} from "./intakeReview";

type ToolId = "single" | JobType;
type ToolGroupId = "main" | "utilities";
type CrawlMode = "full" | "incremental";
type DisplayDetection =
  | AutomaticConversionDetection
  | {
      route: "document-convert";
      contentKind: "actor";
      cardinality: "unknown";
      confidence: "high";
      label: string;
      reasons: string[];
      usesAi: false;
      itemCount?: number;
    };
type WorkspaceView =
  | "input"
  | "workbench"
  | "review"
  | "log";

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
    id: "single",
    group: "main",
    title: "转换为 Foundry JSON",
    short: "自动转换",
    description:
      "上传或粘贴资料，系统自动识别 Actor、Item、单条、合集与图片 / PDF，并选择正式 workflow。",
    accepts: ".md,.markdown,.txt,.pdf,.png,.jpg,.jpeg,.webp",
    needsFile: true,
  },
  {
    id: "ingest-items",
    group: "utilities",
    title: "物品 Markdown 拆分",
    short: "物品拆分",
    description: "把物品合集拆成项目可读的单个物品 Markdown。",
    accepts: ".md,.markdown,.txt",
    needsFile: true,
  },
  {
    id: "records-to-plaintext",
    group: "utilities",
    title: "导出审计文本",
    short: "Records",
    description:
      "上传 Goddess Fantasy crawl 的 records.json，导出人类可读审计 Markdown，不参与 JSON 生成。",
    accepts: ".json",
    needsFile: true,
  },
  {
    id: "translate-json",
    group: "utilities",
    title: "JSON 翻译",
    short: "翻译",
    description: "上传 JSON，由 VPS 环境变量中的翻译服务配置执行翻译。",
    accepts: ".json",
    needsFile: true,
  },
  {
    id: "goddessfantasy-board-crawl",
    group: "utilities",
    title: "Goddess Fantasy 爬站",
    short: "爬站",
    description:
      "输入版块 URL，使用 VPS 环境变量里的 cookie 或登录配置抓取 records。",
    accepts: "",
    needsFile: false,
  },
  {
    id: "vault-sync",
    group: "utilities",
    title: "Vault Sync",
    short: "Vault",
    description:
      "同步服务器本地 vault/input 到 vault/output，适合自用 VPS 维护任务。",
    accepts: "",
    needsFile: false,
    supportsImageAssets: true,
  },
];

const toolGroups: Array<{ id: ToolGroupId; title: string; detail: string }> = [
  { id: "main", title: "主要入口", detail: "自动识别，减少预先选择" },
  { id: "utilities", title: "工具箱", detail: "同步、翻译、拆分与抓取" },
];

const terminalStatuses: JobStatus[] = [
  "succeeded",
  "needs_review",
  "partial",
  "failed",
];
const goddessFantasyBoardUrl =
  "https://www.goddessfantasy.net/bbs/index.php?board=2318.0";

export function App() {
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(
    null,
  );
  const [defaults, setDefaults] = useState<DefaultsResponse | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>("single");
  const [fileName, setFileName] = useState("uploaded.md");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [content, setContent] = useState("");
  const [documentCandidateText, setDocumentCandidateText] = useState("");
  const [documentExtractOnly, setDocumentExtractOnly] = useState(false);
  const [fvttVersion, setFvttVersion] = useState<FvttVersion>("14");
  const [effectProfile, setEffectProfile] = useState<EffectProfile>("core");
  const [iconMode, setIconMode] = useState<IconMode>("off");
  const [boardUrl, setBoardUrl] = useState(goddessFantasyBoardUrl);
  const [vaultPath, setVaultPath] = useState("");
  const [enableAiNormalize, setEnableAiNormalize] = useState(false);
  const [clearBackup, setClearBackup] = useState(false);
  const [imageAssetsEnabled, setImageAssetsEnabled] = useState(false);
  const [imageTokenCropsText, setImageTokenCropsText] = useState("");
  const [singleResult, setSingleResult] = useState<ConversionResult | null>(
    null,
  );
  const [job, setJob] = useState<WebJob | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [error, setError] = useState("");
  const [mobileTab, setMobileTab] = useState<"input" | "result" | "log">(
    "input",
  );
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("input");
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const [visibleWorkbenchPane, setVisibleWorkbenchPane] = useState<
    "both" | "source" | "result"
  >("both");
  const [activeSourceLine, setActiveSourceLine] = useState(1);
  const [sourceVariant, setSourceVariant] = useState<"original" | "standard">(
    "original",
  );
  const [conversionDetection, setConversionDetection] =
    useState<DisplayDetection | null>(null);
  const [detectionStatus, setDetectionStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [standardMarkdown, setStandardMarkdown] = useState("");
  const [allowAiIntake, setAllowAiIntake] = useState(false);
  const [manualRoute, setManualRoute] = useState<
    "ai-monster-intake" | "ai-item-intake" | null
  >(null);
  const pollRef = useRef<number | null>(null);
  const splitWorkbenchRef = useRef<HTMLDivElement | null>(null);

  const tool = tools.find((item) => item.id === activeTool) ?? tools[0]!;
  const supportsImageAssets = Boolean(tool.supportsImageAssets);
  const supportsAiNormalize = activeTool === "vault-sync";
  const supportsClearBackup = activeTool === "vault-sync";
  const documentSourceSelected =
    activeTool === "single" && isDocumentSourceFile(fileName);
  const aiItemRouteSelected =
    activeTool === "ai-item-intake" ||
    conversionDetection?.route === "ai-item-intake";
  const uploadLimitMb =
    activeTool === "single" && !documentSourceSelected
      ? (capabilities?.limits.singleUploadMb ?? 5)
      : (capabilities?.limits.collectionUploadMb ?? 20);

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
        setStatus("error");
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
          setStatus(nextJob.status === "failed" ? "error" : "success");
          setMobileTab("result");
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
      } catch (nextError) {
        setStatus("error");
        setError(
          nextError instanceof Error ? nextError.message : String(nextError),
        );
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
    if (aiItemRouteSelected) {
      if (fvttVersion !== "14") setFvttVersion("14");
      if (effectProfile !== "core") setEffectProfile("core");
      return;
    }
    if (activeTool === "ai-monster-intake" && fvttVersion === "13")
      setFvttVersion("14");
  }, [activeTool, aiItemRouteSelected, effectProfile, fvttVersion]);

  useEffect(() => {
    if (fvttVersion !== "14" && iconMode !== "off") setIconMode("off");
  }, [fvttVersion, iconMode]);

  useEffect(() => {
    if (!job) return;
    if (job.status === "needs_review") setWorkspaceView("review");
    if (job.status === "succeeded" || job.status === "partial")
      setWorkspaceView("workbench");
    if (job.status === "failed") setWorkspaceView("log");
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (singleResult) setWorkspaceView("workbench");
  }, [singleResult]);

  useEffect(() => {
    if (activeTool !== "single") {
      setConversionDetection(null);
      setDetectionStatus("idle");
      return;
    }
    if (documentSourceSelected) {
      setConversionDetection({
        route: "document-convert",
        contentKind: "actor",
        cardinality: "unknown",
        confidence: "high",
        label: "图片 / PDF Actor 资料",
        reasons: ["根据文件格式进入文档提取、候选筛选与 Actor 生成流程。"],
        usesAi: false,
      });
      setDetectionStatus("ready");
      return;
    }
    if (!content.trim()) {
      setConversionDetection(null);
      setDetectionStatus("idle");
      return;
    }

    let cancelled = false;
    setDetectionStatus("loading");
    const timer = window.setTimeout(() => {
      detectConversion({ fileName, content })
        .then((nextDetection) => {
          if (cancelled) return;
          setConversionDetection(nextDetection);
          setDetectionStatus("ready");
        })
        .catch(() => {
          if (cancelled) return;
          setConversionDetection(null);
          setDetectionStatus("error");
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTool, content, documentSourceSelected, fileName]);

  useEffect(() => {
    if (!job || !terminalStatuses.includes(job.status)) {
      setStandardMarkdown("");
      return;
    }
    const markdownFiles = job.files.filter((file) =>
      /\.md$/i.test(file.fileName),
    );
    if (markdownFiles.length === 0) {
      setStandardMarkdown("");
      return;
    }

    let cancelled = false;
    Promise.all(
      markdownFiles.map(async (file) => ({
        label: file.label,
        content: await fetch(file.downloadUrl).then((response) => response.text()),
      })),
    )
      .then((previews) => {
        if (cancelled) return;
        setStandardMarkdown(
          previews
            .map((preview) => `# ${preview.label}\n\n${preview.content}`)
            .join("\n\n---\n\n"),
        );
      })
      .catch(() => {
        if (!cancelled) setStandardMarkdown("");
      });
    return () => {
      cancelled = true;
    };
  }, [job?.id, job?.status, job?.files]);

  const jsonPreview = useMemo(() => {
    if (singleResult) return JSON.stringify(singleResult.rawJson, null, 2);
    if (job?.summary) return JSON.stringify(job.summary, null, 2);
    return '{\n  "state": "等待上传或启动任务"\n}';
  }, [job?.summary, singleResult]);
  const hasDistinctStandardMarkdown = Boolean(
    standardMarkdown && standardMarkdown.trim() !== content.trim(),
  );
  const sourcePreviewText =
    sourceVariant === "standard" && hasDistinctStandardMarkdown
      ? standardMarkdown
      : content || "尚未提供可预览的文本来源。";
  const sourceLines = useMemo(
    () => sourcePreviewText.split("\n"),
    [sourcePreviewText],
  );

  function handleSplitPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    const workbench = splitWorkbenchRef.current;
    if (!workbench) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const updateSplit = (clientX: number) => {
      const bounds = workbench.getBoundingClientRect();
      const next = ((clientX - bounds.left) / bounds.width) * 100;
      setSplitPercent(Math.min(72, Math.max(28, next)));
    };
    const handleMove = (moveEvent: PointerEvent) =>
      updateSplit(moveEvent.clientX);
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!isAcceptedFile(file.name, tool.accepts)) {
      setStatus("error");
      setError(`文件类型不匹配：当前工具接受 ${tool.accepts || "无文件输入"}`);
      return;
    }
    const fileLimitMb =
      activeTool === "single" && !isDocumentSourceFile(file.name)
        ? (capabilities?.limits.singleUploadMb ?? 5)
        : (capabilities?.limits.collectionUploadMb ?? 20);
    if (file.size > fileLimitMb * 1024 * 1024) {
      setStatus("error");
      setError(`文件超过 ${fileLimitMb} MB 限制。`);
      return;
    }
    setFileName(file.name);
    setSelectedFile(file);
    const isDocument = isDocumentSourceFile(file.name);
    setContent(activeTool === "document-convert" || isDocument ? "" : await file.text());
    if (activeTool === "document-convert" || isDocument)
      setDocumentCandidateText("");
    setSourceVariant("original");
    setStandardMarkdown("");
    setAllowAiIntake(false);
    setManualRoute(null);
    setSingleResult(null);
    setJob(null);
    setError("");
    setStatus("idle");
  }

  async function runCurrentTool(crawlMode?: CrawlMode) {
    setStatus("loading");
    setError("");
    setSingleResult(null);
    setJob(null);

    try {
      if (
        activeTool === "document-convert" ||
        (activeTool === "single" && selectedFile && isDocumentSourceFile(selectedFile.name))
      ) {
        if (!selectedFile) throw new Error("请先选择 PDF 或图片文件。");
        const nextJob = await createDocumentJob({
          file: selectedFile,
          fvttVersion,
          effectProfile,
          iconMode,
          candidateIds: documentCandidateText
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          extractOnly: documentExtractOnly,
        });
        setJob(nextJob);
        setWorkspaceView("workbench");
        setVisibleWorkbenchPane("both");
        setMobileTab("result");
        return;
      }

      if (activeTool === "single") {
        const automaticDetection = await detectConversion({ fileName, content });
        const detection =
          manualRoute && conversionDetection
            ? conversionDetection
            : automaticDetection;
        setConversionDetection(detection);
        setDetectionStatus("ready");
        if (detection.route === "needs-review") {
          throw new Error(
            `${detection.label}：${detection.reasons.join(" ")} 请补充标准 frontmatter，或明确这是 Actor 还是 Item。`,
          );
        }
        if (detection.usesAi && !allowAiIntake) {
          throw new Error("系统判断这份资料需要 AI 整理。请先确认允许发送到服务器配置的 AI provider。 ");
        }
        if (
          detection.route === "ai-item-intake" &&
          (fvttVersion !== "14" || effectProfile !== "core")
        ) {
          throw new Error("AI Item 整理目前要求 Foundry v14 + core。请调整目标后再运行。");
        }
        if (detection.route === "single") {
          const result = await convertSingle({
            fileName,
            content,
            fvttVersion,
            effectProfile,
            iconMode,
          });
          setSingleResult(result);
          setStatus("success");
          setMobileTab("result");
          return;
        }

        const nextJob = await createJob({
          type: detection.route,
          fileName,
          content,
          options: {
            fvttVersion,
            effectProfile,
            iconMode,
            contentType: detection.contentKind === "actor" ? "monster" : undefined,
          },
        });
        setJob(nextJob);
        setWorkspaceView("workbench");
        setVisibleWorkbenchPane("both");
        setMobileTab("result");
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
          contentType: "monster",
          imageAssetsEnabled: supportsImageAssets && imageAssetsEnabled,
          imageTokenCrops:
            supportsImageAssets && imageAssetsEnabled
              ? parseImageTokenCrops(imageTokenCropsText)
              : undefined,
        },
      });
      setJob(nextJob);
      setWorkspaceView("workbench");
      setVisibleWorkbenchPane("both");
      setMobileTab("result");
    } catch (nextError) {
      setStatus("error");
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    }
  }

  async function copyPreview() {
    await navigator.clipboard.writeText(jsonPreview);
  }

  function selectTool(nextTool: ToolConfig) {
    setActiveTool(nextTool.id);
    setSingleResult(null);
    setJob(null);
    setError("");
    setStatus("idle");
    setConversionDetection(null);
    setDetectionStatus("idle");
    setAllowAiIntake(false);
    setManualRoute(null);
    setStandardMarkdown("");
    setSourceVariant("original");
    setWorkspaceView("input");
    setToolMenuOpen(false);
    if (nextTool.accepts === ".json" && !fileName.endsWith(".json"))
      setFileName("uploaded.json");
    if (nextTool.accepts !== ".json" && fileName.endsWith(".json"))
      setFileName("uploaded.md");
  }

  function selectFvttVersion(nextVersion: FvttVersion) {
    setFvttVersion(nextVersion);
    const matchingModdedProfile =
      nextVersion === "14" ? "modded-v14" : "modded-v12";
    if (effectProfile !== "core" && effectProfile !== matchingModdedProfile) {
      setEffectProfile("core");
    }
  }

  const canRun =
    activeTool === "single"
      ? documentSourceSelected
        ? Boolean(selectedFile)
        : Boolean(content.trim()) &&
          detectionStatus === "ready" &&
          conversionDetection?.route !== "needs-review" &&
          (!aiItemRouteSelected ||
            (fvttVersion === "14" && effectProfile === "core")) &&
          (!conversionDetection?.usesAi ||
            (allowAiIntake && Boolean(capabilities?.monsterIntakeConfigured)))
      : activeTool === "document-convert"
      ? Boolean(selectedFile)
      : activeTool === "goddessfantasy-board-crawl"
        ? Boolean(boardUrl.trim())
        : activeTool === "vault-sync"
          ? Boolean(vaultPath.trim())
          : Boolean(content.trim());
  const hasStartedTask =
    Boolean(job) || Boolean(singleResult) || status === "loading";

  const reviewCount =
    job?.status === "needs_review"
      ? Math.max(
          1,
          Array.isArray(job.summary?.creatures)
            ? (job.summary.creatures as unknown as IntakeReviewCreature[])
                .flatMap((creature) => creature.findings ?? [])
                .filter((finding) => finding.blocking).length
            : 0,
        )
      : 0;
  const formalArtifactReady =
    Boolean(singleResult) || job?.status === "succeeded";
  const activeStage =
    status === "loading" || (job && !terminalStatuses.includes(job.status))
      ? "extract"
      : job?.status === "needs_review"
        ? "review"
        : formalArtifactReady || job?.status === "partial"
          ? "deliver"
          : "input";
  const providerRequired =
    conversionDetection?.usesAi ||
    activeTool === "ai-monster-intake" ||
    activeTool === "ai-item-intake";
  const providerReady = providerRequired
      ? Boolean(capabilities?.monsterIntakeConfigured)
      : true;
  const targetLabel = "Foundry " + fvttVersion + " · " + effectProfile;
  const stages = [
    {
      id: "input",
      label: "输入",
      detail: selectedFile || content.trim() ? "已准备来源" : "等待来源",
      icon: <UploadIcon />,
    },
    {
      id: "extract",
      label: "提取",
      detail:
        activeStage === "extract"
          ? "正在处理"
          : job || singleResult
            ? "已生成结构"
            : "等待运行",
      icon: <MagicWandIcon />,
    },
    {
      id: "review",
      label: "核对",
      detail: reviewCount
        ? reviewCount + " 项待确认"
        : job || singleResult
          ? "无需人工确认"
          : "等待提取",
      icon: <ExclamationTriangleIcon />,
    },
    {
      id: "deliver",
      label: "交付",
      detail: formalArtifactReady ? "正式产物可用" : "等待验收",
      icon: <RocketIcon />,
    },
  ] as const;
  const stageOrder = stages.map((stage) => stage.id);
  const activeStageIndex = stageOrder.indexOf(activeStage);
  const workspaceTabs: Array<{
    id: WorkspaceView;
    label: string;
    icon: ReactNode;
  }> = [
    { id: "input", label: "任务输入", icon: <UploadIcon /> },
    ...(hasStartedTask
      ? ([
          {
            id: "workbench",
            label: "来源 / 结果",
            icon: <Link2Icon />,
          },
        ] as const)
      : []),
    { id: "review", label: "核对问题", icon: <ExclamationTriangleIcon /> },
    { id: "log", label: "运行日志", icon: <ClockIcon /> },
  ];

  return (
    <main className="studio-shell">
      <header className="studio-topbar">
        <div className="brand-lockup">
          <span className="brand-mark">
            <DashboardIcon />
          </span>
          <div>
            <strong>Foundry 内容工坊</strong>
            <span>Actor / Item 工作台</span>
          </div>
        </div>

        <div className="workflow-switcher">
          <button
            className="workflow-trigger"
            aria-expanded={toolMenuOpen}
            onClick={() => setToolMenuOpen(!toolMenuOpen)}
          >
            <span>{tool.title}</span>
            <ChevronDownIcon />
          </button>
          {toolMenuOpen ? (
            <div className="workflow-menu" role="menu">
              {toolGroups.map((group) => (
                <section key={group.id}>
                  <header>
                    <strong>{group.title}</strong>
                    <span>{group.detail}</span>
                  </header>
                  <div>
                    {tools
                      .filter((item) => item.group === group.id)
                      .map((item) => (
                        <button
                          key={item.id}
                          role="menuitem"
                          className={activeTool === item.id ? "is-active" : ""}
                          onClick={() => selectTool(item)}
                        >
                          <span>{item.title}</span>
                          <small>{item.description}</small>
                        </button>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </div>

        <div className="topbar-actions">
          <span className="target-chip">{targetLabel}</span>
          <span
            className={
              "provider-chip " + (providerReady ? "is-ready" : "is-warning")
            }
          >
            <span />
            {providerRequired
              ? providerReady
                ? "AI 提供方就绪"
                : "AI 提供方未配置"
              : "无需 AI"}
          </span>
          <button
            className="topbar-button"
            onClick={() => setWorkspaceView("log")}
          >
            <ClockIcon />
            任务记录
          </button>
        </div>
      </header>

      <section className="studio-body">
        <aside className="stage-rail" aria-label="任务进度">
          <div className="stage-kicker">当前任务</div>
          <div className="stage-list">
            {stages.map((stage, index) => {
              const isActive = stage.id === activeStage;
              const isComplete =
                index < activeStageIndex ||
                (stage.id === "deliver" && formalArtifactReady);
              const isBlocked = stage.id === "review" && reviewCount > 0;
              return (
                <button
                  key={stage.id}
                  className={[
                    "stage-item",
                    isActive ? "is-active" : "",
                    isComplete ? "is-complete" : "",
                    isBlocked ? "is-blocked" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    if (stage.id === "input") setWorkspaceView("input");
                    if (stage.id === "review") setWorkspaceView("review");
                    if (stage.id === "deliver")
                      setWorkspaceView(hasStartedTask ? "workbench" : "input");
                  }}
                >
                  <span className="stage-icon">
                    {isComplete ? <CheckCircledIcon /> : stage.icon}
                  </span>
                  <span>
                    <strong>{stage.label}</strong>
                    <small>{stage.detail}</small>
                  </span>
                  {isBlocked ? <em>{reviewCount}</em> : null}
                </button>
              );
            })}
          </div>
          <div className="rail-note">
            <strong>验收目标</strong>
            <span>{targetLabel}</span>
            <small>机械检查与来源语义验收分开记录</small>
          </div>
        </aside>

        <section
          className={`workspace-panel ${
            workspaceView === "workbench" ? "is-workbench-active" : ""
          }`}
        >
          <header className="workspace-header">
            <div>
              <span className="workspace-eyebrow">当前工作流</span>
              <h1>{tool.title}</h1>
              <p>{tool.description}</p>
            </div>
            <StatusBadge status={status} jobStatus={job?.status} />
          </header>

          <nav className="workspace-tabs" aria-label="工作区视图">
            {workspaceTabs.map((tab) => (
              <button
                key={tab.id}
                className={workspaceView === tab.id ? "is-active" : ""}
                onClick={() => setWorkspaceView(tab.id)}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.id === "review" && reviewCount ? (
                  <em>{reviewCount}</em>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="workspace-canvas">
            {workspaceView === "input" ? (
              <section className="input-workspace">
                <header className="source-commandbar">
                  <div>
                    <span className="workspace-eyebrow">任务来源</span>
                    <strong>提供需要整理的原始内容</strong>
                  </div>
                  {tool.needsFile ? (
                    <label
                      className={
                        activeTool === "document-convert" || documentSourceSelected
                          ? "source-upload-button is-document"
                          : "source-upload-button"
                      }
                    >
                      <UploadIcon />
                      <strong>{selectedFile ? "更换文件" : "选择文件"}</strong>
                      <input
                        type="file"
                        accept={tool.accepts}
                        onChange={handleFileChange}
                      />
                    </label>
                  ) : null}
                  {tool.needsFile ? (
                    <label className="source-name-field">
                      <span>文件名</span>
                      <input
                        value={fileName}
                        onChange={(event) => setFileName(event.target.value)}
                      />
                    </label>
                  ) : null}
                  <span className="limit-badge">上限 {uploadLimitMb} MB</span>
                </header>

                {activeTool === "document-convert" && !selectedFile ? (
                  <div className="document-drop-hint">
                    <UploadIcon />
                    <strong>选择 PDF 或图片后开始提取</strong>
                    <span>支持 {tool.accepts}</span>
                  </div>
                ) : null}

                {activeTool === "single" && documentSourceSelected ? (
                  <div className="document-drop-hint is-selected">
                    <FileTextIcon />
                    <strong>{selectedFile?.name ?? fileName}</strong>
                    <span>将自动进入文档提取、候选筛选与 Actor 生成流程。</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setFileName("uploaded.md");
                        setConversionDetection(null);
                        setDetectionStatus("idle");
                      }}
                    >
                      改为粘贴文本
                    </button>
                  </div>
                ) : null}

                <div className="form-grid">
                  {tool.needsFile && activeTool === "document-convert" ? (
                    <label className="field">
                      <span>文件名</span>
                      <input
                        value={fileName}
                        onChange={(event) => setFileName(event.target.value)}
                      />
                    </label>
                  ) : null}
                  {activeTool === "document-convert" ? (
                    <>
                      <label className="field field-wide">
                        <span>候选 ID（可选，逗号分隔）</span>
                        <input
                          value={documentCandidateText}
                          onChange={(event) =>
                            setDocumentCandidateText(event.target.value)
                          }
                          placeholder="例如 p20-beholder-hivemother-p20-block1"
                        />
                      </label>
                      <label className="check-field field-wide">
                        <input
                          type="checkbox"
                          checked={documentExtractOnly}
                          onChange={(event) =>
                            setDocumentExtractOnly(event.target.checked)
                          }
                        />
                        <span>
                          <strong>只做提取与筛选</strong>
                          <small>不翻译，也不生成 JSON</small>
                        </span>
                      </label>
                    </>
                  ) : null}
                  {tool.needsFile &&
                  activeTool !== "document-convert" &&
                  !documentSourceSelected ? (
                    <label className="field field-wide source-editor-field">
                      <span>资料内容</span>
                      <textarea
                        value={content}
                        onChange={(event) => {
                          setContent(event.target.value);
                          setSelectedFile(null);
                          setAllowAiIntake(false);
                          setManualRoute(null);
                        }}
                        placeholder={
                          tool.accepts === ".json"
                            ? "粘贴 JSON 内容"
                            : "粘贴 Markdown 或纯文本内容"
                        }
                      />
                    </label>
                  ) : null}
                  {activeTool === "goddessfantasy-board-crawl" ? (
                    <label className="field field-wide">
                      <span>Board URL</span>
                      <input
                        value={boardUrl}
                        onChange={(event) => setBoardUrl(event.target.value)}
                        placeholder="https://goddessfantasy.net/..."
                      />
                    </label>
                  ) : null}
                  {activeTool === "vault-sync" ? (
                    <label className="field field-wide">
                      <span>Vault 路径</span>
                      <input
                        value={vaultPath}
                        onChange={(event) => setVaultPath(event.target.value)}
                        placeholder={
                          defaults?.vaultPath || "obsidian/dnd数据转fvttjson"
                        }
                      />
                    </label>
                  ) : null}
                  <label className="field">
                    <span>Foundry 目标</span>
                    <select
                      value={fvttVersion}
                      disabled={aiItemRouteSelected}
                      onChange={(event) =>
                        selectFvttVersion(event.target.value as FvttVersion)
                      }
                    >
                      <option value="14">v14（推荐）</option>
                      {!aiItemRouteSelected ? (
                        <option value="12">v12（旧世界兼容）</option>
                      ) : null}
                      {activeTool !== "ai-monster-intake" &&
                      !aiItemRouteSelected ? (
                        <option value="13">v13（旧世界兼容）</option>
                      ) : null}
                    </select>
                  </label>
                  <label className="field">
                    <span>Effect Profile</span>
                    <select
                      value={effectProfile}
                      disabled={aiItemRouteSelected}
                      onChange={(event) =>
                        setEffectProfile(event.target.value as EffectProfile)
                      }
                    >
                      <option value="core">core（推荐，原生兼容）</option>
                      {fvttVersion === "14" ? (
                        <option value="modded-v14">
                          modded-v14（DAE / MIDI-QOL 自动化）
                        </option>
                      ) : (
                        <option value="modded-v12">
                          modded-v12（旧版模块自动化）
                        </option>
                      )}
                    </select>
                  </label>
                  <details className="profile-guide-compact field-wide">
                    <summary>
                      <MixerHorizontalIcon />
                      <strong>{effectProfile}</strong>
                      <span>
                        {effectProfile === "core"
                          ? `只依赖 Foundry ${fvttVersion} 与 dnd5e，原生兼容。`
                          : "包含 DAE / MIDI-QOL 自动化，需要对应模块。"}
                      </span>
                      <em>查看 core 与 modded 区别</em>
                    </summary>
                    <div>
                      <p>
                        <strong>core：</strong>移除 DAE、MIDI-QOL
                        专属自动化，兼容性和可迁移性最好。
                      </p>
                      <p>
                        <strong>
                          {fvttVersion === "14"
                            ? "modded-v14："
                            : "modded-v12："}
                        </strong>
                        {fvttVersion === "14"
                          ? "面向已安装 DAE 14.0.12 与 MIDI-QOL 14.0.11 的世界，增加来源明确的自动化；缺少模块时不要选择。"
                          : "面向旧版 Foundry 模块环境保留兼容自动化；新项目请使用 v14 + core。"}
                      </p>
                    </div>
                  </details>
                </div>

                {activeTool === "single" ? (
                  <ConversionDetectionPanel
                    detection={conversionDetection}
                    status={detectionStatus}
                    providerReady={Boolean(capabilities?.monsterIntakeConfigured)}
                    allowAi={allowAiIntake}
                    onAllowAiChange={setAllowAiIntake}
                    onChooseKind={(kind) => {
                      setManualRoute(
                        kind === "actor"
                          ? "ai-monster-intake"
                          : "ai-item-intake",
                      );
                      setConversionDetection({
                        route:
                          kind === "actor"
                            ? "ai-monster-intake"
                            : "ai-item-intake",
                        contentKind: kind,
                        cardinality: "single",
                        confidence: "medium",
                        label:
                          kind === "actor"
                            ? "用户确认的 Actor 资料"
                            : "用户确认的 Item 资料",
                        reasons: ["自动识别无法消除歧义，已采用本次人工确认。"],
                        usesAi: true,
                      });
                      setAllowAiIntake(false);
                    }}
                  />
                ) : null}

                {fvttVersion === "14" ? (
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={iconMode === "safe"}
                      onChange={(event) =>
                        setIconMode(event.target.checked ? "safe" : "off")
                      }
                    />
                    <span>
                      <strong>安全匹配特性图标</strong>
                      <small>默认关闭；只使用可信映射</small>
                    </span>
                  </label>
                ) : null}
                {supportsAiNormalize || supportsClearBackup ? (
                  <div className="inline-checks">
                    {supportsAiNormalize ? (
                      <label>
                        <input
                          type="checkbox"
                          checked={enableAiNormalize}
                          onChange={(event) =>
                            setEnableAiNormalize(event.target.checked)
                          }
                        />
                        AI normalize
                      </label>
                    ) : null}
                    {supportsClearBackup ? (
                      <label>
                        <input
                          type="checkbox"
                          checked={clearBackup}
                          onChange={(event) =>
                            setClearBackup(event.target.checked)
                          }
                        />
                        清理备份
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
              </section>
            ) : null}

            {workspaceView === "workbench" ? (
              <section className="linked-workbench">
                <header className="linked-workbench-toolbar">
                  <div className="linked-source-meta">
                    <span>来源文件</span>
                    <strong>{fileName}</strong>
                    <em>{content.length.toLocaleString()} 字符</em>
                  </div>
                  <div className="linked-workbench-actions">
                    <span className="link-status">
                      <Link2Icon />
                      来源定位 L{activeSourceLine}
                    </span>
                    <button
                      className={
                        visibleWorkbenchPane === "source" ? "is-active" : ""
                      }
                      onClick={() =>
                        setVisibleWorkbenchPane(
                          visibleWorkbenchPane === "source" ? "both" : "source",
                        )
                      }
                    >
                      <ChevronRightIcon />
                      仅来源
                    </button>
                    <button
                      className={
                        visibleWorkbenchPane === "result" ? "is-active" : ""
                      }
                      onClick={() =>
                        setVisibleWorkbenchPane(
                          visibleWorkbenchPane === "result" ? "both" : "result",
                        )
                      }
                    >
                      <ChevronLeftIcon />
                      仅结果
                    </button>
                  </div>
                </header>
                <div
                  ref={splitWorkbenchRef}
                  className={`split-workbench is-${visibleWorkbenchPane}`}
                  style={
                    {
                      "--source-pane": `${splitPercent}%`,
                    } as CSSProperties
                  }
                >
                  {visibleWorkbenchPane !== "result" ? (
                    <section className="split-pane source-pane">
                      <header>
                        <div>
                          <span>
                            {sourceVariant === "standard" ? "中间产物" : "原始内容"}
                          </span>
                          <strong>
                            {sourceVariant === "standard"
                              ? "标准 Markdown"
                              : "来源与证据"}
                          </strong>
                        </div>
                        <div className="source-pane-actions">
                          {hasDistinctStandardMarkdown ? (
                            <span className="source-variant-switch" role="group" aria-label="来源版本">
                              <button
                                className={sourceVariant === "original" ? "is-active" : ""}
                                onClick={() => setSourceVariant("original")}
                              >
                                原始
                              </button>
                              <button
                                className={sourceVariant === "standard" ? "is-active" : ""}
                                onClick={() => setSourceVariant("standard")}
                              >
                                标准 Markdown
                              </button>
                            </span>
                          ) : null}
                          <button onClick={() => setWorkspaceView("input")}>
                            返回编辑
                          </button>
                        </div>
                      </header>
                      <div className="source-code" role="list">
                        {sourceLines.map((line, index) => {
                          const lineNumber = index + 1;
                          return (
                            <button
                              key={`${lineNumber}-${line.slice(0, 24)}`}
                              className={
                                activeSourceLine === lineNumber
                                  ? "source-code-line is-linked"
                                  : "source-code-line"
                              }
                              onClick={() => setActiveSourceLine(lineNumber)}
                            >
                              <span>{lineNumber}</span>
                              <code>{line || " "}</code>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}

                  {visibleWorkbenchPane === "both" ? (
                    <button
                      className="split-divider"
                      aria-label="拖动调整来源和结果宽度"
                      aria-orientation="vertical"
                      role="separator"
                      onDoubleClick={() => setSplitPercent(50)}
                      onPointerDown={handleSplitPointerDown}
                    >
                      <span>
                        <Link2Icon />
                      </span>
                    </button>
                  ) : null}

                  {visibleWorkbenchPane !== "source" ? (
                    <section className="split-pane result-pane">
                      <header>
                        <div>
                          <span>结构化结果</span>
                          <strong>JSON 预览</strong>
                        </div>
                        <div>
                          <span className="result-source-location">
                            来源 L{activeSourceLine}
                          </span>
                          <button
                            onClick={copyPreview}
                            disabled={!singleResult && !job?.summary}
                          >
                            <ClipboardCopyIcon />
                            复制
                          </button>
                        </div>
                      </header>
                      {error ? (
                        <div className="error-box">
                          <CrossCircledIcon />
                          <span>{error}</span>
                        </div>
                      ) : null}
                      <pre className="split-json-preview">{jsonPreview}</pre>
                    </section>
                  ) : null}
                </div>
              </section>
            ) : null}

            {workspaceView === "review" ? (
              <section className="review-workspace">
                <header className="section-heading">
                  <div>
                    <span>结构化核对</span>
                    <h2>
                      {reviewCount
                        ? reviewCount + " 项问题阻止正式交付"
                        : "当前没有待确认问题"}
                    </h2>
                  </div>
                  {reviewCount ? (
                    <span className="blocking-badge">
                      <ExclamationTriangleIcon />
                      需要确认
                    </span>
                  ) : (
                    <span className="ready-badge">
                      <CheckCircledIcon />
                      已通过
                    </span>
                  )}
                </header>
                {error ? (
                  <div className="error-box">
                    <CrossCircledIcon />
                    <span>{error}</span>
                  </div>
                ) : null}
                {job ? (
                  <Progress job={job} />
                ) : (
                  <div className="empty-state">
                    <MagicWandIcon />
                    <strong>先运行任务，再在这里核对结构化结果</strong>
                    <span>阻断问题会带来源证据和明确决定入口。</span>
                  </div>
                )}
                <CrawlSummary job={job} />
                <ImageAssetSummary capabilities={capabilities} job={job} />
                <IntakeReviewPanel
                  job={job}
                  onResumed={(nextJob) => {
                    setJob(nextJob);
                    setStatus("loading");
                    setError("");
                  }}
                  onError={(message) => {
                    setStatus("error");
                    setError(message);
                  }}
                />
                <DocumentCandidatesPanel
                  job={job}
                  selectedIds={documentCandidateText
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean)}
                  onSelectionChange={(ids) =>
                    setDocumentCandidateText(ids.join(","))
                  }
                />
              </section>
            ) : null}

            {workspaceView === "log" ? (
              <section className="log-workspace">
                <header className="section-heading">
                  <div>
                    <span>任务记录</span>
                    <h2>运行日志与警告</h2>
                  </div>
                </header>
                <Warnings singleResult={singleResult} job={job} />
                <RunLog job={job} />
              </section>
            ) : null}
          </div>
        </section>

        <aside className="artifact-panel">
          <header>
            <div>
              <span>交付清单</span>
              <h2>产物与验收状态</h2>
            </div>
            <ArchiveIcon />
          </header>
          <section
            className={
              "artifact-group " +
              (formalArtifactReady ? "is-ready" : "is-blocked")
            }
          >
            <div className="artifact-status-line">
              <span className="artifact-status-icon">
                {formalArtifactReady ? (
                  <CheckCircledIcon />
                ) : (
                  <CrossCircledIcon />
                )}
              </span>
              <div>
                <strong>正式 Foundry JSON</strong>
                <small>
                  {formalArtifactReady
                    ? "已通过工作流验收，可下载"
                    : reviewCount
                      ? "被待确认问题阻止"
                      : "等待任务完成"}
                </small>
              </div>
            </div>
          </section>
          <section className="artifact-group is-supporting">
            <h3>可复核产物</h3>
            <div className="artifact-row">
              <FileTextIcon />
              <span>
                <strong>标准 Markdown</strong>
                <small>{job ? "随任务生成或可下载" : "等待任务"}</small>
              </span>
            </div>
            <div className="artifact-row">
              <ReaderIcon />
              <span>
                <strong>Intake / 来源报告</strong>
                <small>{job ? "任务上下文已建立" : "等待任务"}</small>
              </span>
            </div>
            <div className="artifact-row">
              <MagicWandIcon />
              <span>
                <strong>AI 审查记录</strong>
                <small>
                  {capabilities?.monsterIntakeConfigured
                    ? "提供方可用"
                    : "提供方未配置"}
                </small>
              </span>
            </div>
          </section>
          <DownloadPanel singleResult={singleResult} job={job} />
          <Warnings singleResult={singleResult} job={job} />
          <section className="trace-note">
            <span className="trace-line" />
            <ReaderIcon />
            <div>
              <strong>证据链不会丢</strong>
              <p>
                来源引用、人工决定与下载产物保持关联；正式 JSON
                只会在对应验收通过后开放。
              </p>
            </div>
          </section>
          <section className="server-facts">
            <div>
              <span>访问</span>
              <strong>
                {capabilities?.publicAccess ? "公网开放" : "本地"}
              </strong>
            </div>
            <div>
              <span>上传限制</span>
              <strong>{uploadLimitMb} MB</strong>
            </div>
            <div>
              <span>图片资产</span>
              <strong>
                {capabilities?.imageAssetsConfigured ? "已配置" : "未配置"}
              </strong>
            </div>
          </section>
        </aside>
      </section>

      <footer className="command-bar">
        <div className="trust-statement">
          <span>
            <CheckCircledIcon />
          </span>
          <div>
            <strong>正式产物必须通过双层验收</strong>
            <small>结构 / schema 绿色不等于来源语义正确。</small>
          </div>
        </div>
        <div className="command-actions">
          <button
            className="secondary-button"
            onClick={() => setWorkspaceView("input")}
          >
            <ArrowLeftIcon />
            返回修改原文
          </button>
          <button
            className="secondary-button"
            onClick={() => setWorkspaceView("log")}
          >
            <ClockIcon />
            查看记录
          </button>
          {activeTool === "goddessfantasy-board-crawl" &&
          workspaceView === "input" ? (
            <>
              <button
                className="secondary-button"
                disabled={!canRun || status === "loading"}
                onClick={() => runCurrentTool("full")}
              >
                <ReloadIcon />
                完整重爬
              </button>
              <button
                className="primary-button"
                disabled={!canRun || status === "loading"}
                onClick={() => runCurrentTool("incremental")}
              >
                {status === "loading" ? (
                  <ReloadIcon className="spin" />
                ) : (
                  <PlayIcon />
                )}
                增量爬取
              </button>
            </>
          ) : workspaceView === "input" ? (
            <button
              className="primary-button"
              disabled={!canRun || status === "loading"}
              onClick={() => runCurrentTool()}
            >
              {status === "loading" ? (
                <ReloadIcon className="spin" />
              ) : (
                <PlayIcon />
              )}
              {activeTool === "single" ? "开始转换" : "运行工具"}
            </button>
          ) : reviewCount ? (
            <button
              className="primary-button"
              onClick={() => setWorkspaceView("review")}
            >
              <ExclamationTriangleIcon />
              处理待确认问题
            </button>
          ) : (
            <button
              className="primary-button"
              onClick={() => setWorkspaceView("input")}
            >
              <RocketIcon />
              开始新任务
            </button>
          )}
        </div>
      </footer>
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

function ConversionDetectionPanel(props: {
  detection: DisplayDetection | null;
  status: "idle" | "loading" | "ready" | "error";
  providerReady: boolean;
  allowAi: boolean;
  onAllowAiChange: (allowed: boolean) => void;
  onChooseKind: (kind: "actor" | "item") => void;
}) {
  if (props.status === "idle") {
    return (
      <section className="conversion-detection is-idle">
        <MagicWandIcon />
        <div>
          <span>自动识别</span>
          <strong>提供资料后判断内容种类与正式 workflow</strong>
        </div>
      </section>
    );
  }
  if (props.status === "loading") {
    return (
      <section className="conversion-detection is-loading">
        <ReloadIcon className="spin" />
        <div>
          <span>自动识别</span>
          <strong>正在检查结构、条目边界与内容类型…</strong>
        </div>
      </section>
    );
  }
  if (props.status === "error" || !props.detection) {
    return (
      <section className="conversion-detection is-review">
        <ExclamationTriangleIcon />
        <div>
          <span>识别暂不可用</span>
          <strong>请检查内容后重试；系统不会在未识别时猜测执行。</strong>
        </div>
      </section>
    );
  }

  const detection = props.detection;
  const routeLabel = automaticRouteLabel(detection.route);
  return (
    <section
      className={`conversion-detection ${
        detection.route === "needs-review"
          ? "is-review"
          : detection.usesAi
            ? "is-ai"
            : "is-ready"
      }`}
    >
      {detection.route === "needs-review" ? (
        <ExclamationTriangleIcon />
      ) : (
        <CheckCircledIcon />
      )}
      <div className="conversion-detection-body">
        <span>系统识别</span>
        <strong>{detection.label}</strong>
        <div className="detection-chips">
          <em>{routeLabel}</em>
          <em>{detection.confidence === "high" ? "高置信度" : detection.confidence === "medium" ? "中置信度" : "需确认"}</em>
          {detection.itemCount ? <em>{detection.itemCount} 条</em> : null}
          <em>Foundry {detection.route === "ai-item-intake" ? "14 · core" : "按当前目标"}</em>
        </div>
        <p>{detection.reasons.join(" ")}</p>
        {detection.route === "needs-review" ? (
          <div className="detection-override-actions">
            <span>如果你已经确认内容种类：</span>
            <button type="button" onClick={() => props.onChooseKind("actor")}>
              按 Actor 整理
            </button>
            <button type="button" onClick={() => props.onChooseKind("item")}>
              按 Item 整理
            </button>
          </div>
        ) : null}
        {detection.usesAi ? (
          <label className="ai-consent-row">
            <input
              type="checkbox"
              checked={props.allowAi}
              disabled={!props.providerReady}
              onChange={(event) => props.onAllowAiChange(event.target.checked)}
            />
            <span>
              <strong>允许发送到服务器配置的 AI provider</strong>
              <small>
                {props.providerReady
                  ? "只在当前任务中用于证据化整理；未勾选不会上传。"
                  : "AI provider 尚未配置，当前不能启动 Intake。"}
              </small>
            </span>
          </label>
        ) : null}
      </div>
    </section>
  );
}

function automaticRouteLabel(route: DisplayDetection["route"]): string {
  switch (route) {
    case "document-convert":
      return "文档提取 → Actor";
    case "single":
      return "直接转换";
    case "monster-collection":
      return "怪物合集";
    case "item-collection":
      return "物品合集";
    case "ai-monster-intake":
      return "AI Actor 整理";
    case "ai-item-intake":
      return "AI Item 整理";
    default:
      return "等待确认";
  }
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
  if (props.job?.type !== "document-convert") return null;
  const candidates = Array.isArray(props.job.summary?.candidates)
    ? (props.job.summary.candidates as Array<{
        id: string;
        label: string;
        pageNumber: number;
        status: string;
        confidence: number;
        reason?: string;
      }>)
    : [];
  const pageCount =
    typeof props.job.summary?.pageCount === "number"
      ? props.job.summary.pageCount
      : undefined;
  return (
    <section className="intake-review">
      <h3>文档候选{pageCount !== undefined ? ` · ${pageCount} 页` : ""}</h3>
      {candidates.length === 0 ? <p>候选清单将在提取阶段后显示。</p> : null}
      {candidates.map((candidate) => (
        <article key={candidate.id}>
          <header>
            <label>
              <input
                type="checkbox"
                disabled={candidate.status !== "high"}
                checked={
                  props.selectedIds.length === 0
                    ? candidate.status === "high"
                    : props.selectedIds.includes(candidate.id)
                }
                onChange={(event) => {
                  const base =
                    props.selectedIds.length === 0
                      ? candidates
                          .filter((item) => item.status === "high")
                          .map((item) => item.id)
                      : props.selectedIds;
                  const next = event.target.checked
                    ? [...new Set([...base, candidate.id])]
                    : base.filter((id) => id !== candidate.id);
                  props.onSelectionChange(next);
                }}
              />
              <strong>{candidate.label}</strong>
            </label>
            <span>
              第 {candidate.pageNumber} 页 · {candidate.status}
            </span>
          </header>
          <p>
            <code>{candidate.id}</code> · 置信度{" "}
            {(candidate.confidence * 100).toFixed(0)}%
          </p>
          {candidate.reason ? <p>{candidate.reason}</p> : null}
        </article>
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
  const creatures =
    props.job?.type === "ai-monster-intake" &&
    Array.isArray(props.job.summary?.creatures)
      ? (props.job.summary.creatures as unknown as IntakeReviewCreature[])
      : [];
  const findings = creatures.flatMap((creature) =>
    (creature.findings ?? [])
      .filter((finding) => finding.blocking)
      .map((finding) => ({ creature, finding })),
  );
  const allFindingsActionable = findings.every(({ finding }) =>
    isReviewFindingActionable(finding),
  );

  useEffect(() => {
    if (!props.job || props.job.status !== "needs_review") return;
    setDrafts(
      Object.fromEntries(
        findings.map(({ finding }) => [
          finding.id,
          createDecisionDraft(finding),
        ]),
      ),
    );
  }, [props.job?.id, props.job?.status]);

  if (!props.job || props.job.type !== "ai-monster-intake") return null;
  if (creatures.length === 0) return null;

  async function submit() {
    if (!props.job) return;
    if (!allFindingsActionable) {
      props.onError(
        "当前问题不能通过人工设值安全修复，请修改原文或重新运行 AI 提取。",
      );
      return;
    }
    setSubmitting(true);
    try {
      const decisions = findings.map(({ finding }) => {
        const draft = drafts[finding.id] ?? createDecisionDraft(finding);
        if (draft.action === "unresolved")
          throw new Error(`问题 ${finding.id} 尚未选择可执行决定。`);
        const requiresValue =
          draft.action === "select" || draft.action === "set";
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
      <div className="review-intro">
        <span>AI Intake 审查台</span>
        <h3>逐项核对来源、候选与人工决定</h3>
        <p>下方连线表示同一问题的证据链：来源引用 → 决定 → 正式产物。</p>
      </div>
      {creatures.map((creature) => (
        <article className="review-creature" key={creature.id}>
          <header>
            <strong>{creature.label}</strong>
            <span>
              {statusLabel(creature.status as JobStatus | "accepted")}
            </span>
          </header>
          {describePortableSpellResolution(creature.spellResolution) ? (
            <p className="intake-spell-status">
              {describePortableSpellResolution(creature.spellResolution)}
            </p>
          ) : null}
          {(creature.findings ?? [])
            .filter((finding) => finding.blocking)
            .map((finding) => {
              const draft = drafts[finding.id] ?? createDecisionDraft(finding);
              return (
                <div className="intake-issue" key={finding.id}>
                  <div className="issue-meta">
                    <code>{finding.code}</code>
                    <code>{finding.path}</code>
                  </div>
                  <p>{finding.message}</p>
                  {finding.evidence?.length ? (
                    <div className="evidence-thread">
                      <span className="thread-label">来源证据</span>
                      {finding.evidence.map((evidence) => (
                        <blockquote key={`${evidence.start}-${evidence.end}`}>
                          {evidence.quote}
                        </blockquote>
                      ))}
                    </div>
                  ) : null}
                  {props.job?.status === "needs_review" &&
                  isReviewFindingActionable(finding) ? (
                    <div className="intake-decision">
                      <span className="thread-label">你的决定</span>
                      <select
                        value={draft.action}
                        onChange={(event) =>
                          setDrafts({
                            ...drafts,
                            [finding.id]: {
                              ...draft,
                              action: event.target.value as typeof draft.action,
                            },
                          })
                        }
                      >
                        <option value="select">选择候选</option>
                        <option value="set">手工设值</option>
                        <option value="preserve-literal">保留原文</option>
                        <option value="exclude">排除可选内容</option>
                      </select>
                      {draft.action === "select" &&
                      finding.candidates?.length ? (
                        <select
                          value={draft.value}
                          onChange={(event) =>
                            setDrafts({
                              ...drafts,
                              [finding.id]: {
                                ...draft,
                                value: event.target.value,
                              },
                            })
                          }
                        >
                          {finding.candidates.map((candidate) => {
                            const value = stringifyDecisionValue(candidate);
                            return (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            );
                          })}
                        </select>
                      ) : null}
                      {draft.action === "set" ? (
                        <input
                          value={draft.value}
                          onChange={(event) =>
                            setDrafts({
                              ...drafts,
                              [finding.id]: {
                                ...draft,
                                value: event.target.value,
                              },
                            })
                          }
                          placeholder="JSON 值或文本"
                        />
                      ) : null}
                    </div>
                  ) : props.job?.status === "needs_review" ? (
                    <p className="intake-decision-note">
                      该问题不能通过当前确认表单安全覆盖，请修改原文或重新运行提取。
                    </p>
                  ) : null}
                </div>
              );
            })}
        </article>
      ))}
      {props.job.status === "needs_review" &&
      findings.length > 0 &&
      allFindingsActionable ? (
        <button
          className="primary-button review-submit"
          disabled={submitting}
          onClick={submit}
        >
          {submitting ? "正在重新验收…" : "提交确认并恢复任务"}
        </button>
      ) : null}
    </section>
  );
}

function stringifyDecisionValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function parseDecisionValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
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
        <span
          className={
            capabilities?.imageAssetsConfigured ? "ready" : "not-ready"
          }
        >
          {capabilities?.imageAssetsConfigured
            ? "服务器预设可用"
            : "服务器预设未完整配置"}
        </span>
      </div>
      <div className="image-preset-grid">
        <PresetRow label="模式" value={capabilities?.imageMode ?? "ssh"} />
        <PresetRow
          label="SSH"
          value={capabilities?.imageSshTarget ?? "未加载"}
        />
        <PresetRow
          label="远程根目录"
          value={capabilities?.imageRemoteRoot ?? "未加载"}
        />
        <PresetRow
          label="公网前缀"
          value={capabilities?.imagePublicBaseUrl ?? "未加载"}
        />
        <PresetRow
          label="Actor 目录"
          value={capabilities?.imageActorDir ?? "actors"}
        />
        <PresetRow
          label="Token 目录"
          value={capabilities?.imageTokenDir ?? "tokens"}
        />
        <PresetRow
          label="Token 框"
          value={capabilities?.imageTokenFrameConfigured ? "已找到" : "缺失"}
        />
        <PresetRow
          label="Token 输出"
          value={`${capabilities?.imageTokenSize ?? 1024}px ${capabilities?.imageTokenFormat ?? "webp"}`}
        />
        <PresetRow
          label="HTTP"
          value={capabilities?.imageAllowHttp ? "允许" : "不允许"}
        />
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
        没有源图的生物不会生成图片；图片下载、裁剪或上传失败只记录 warning，JSON
        继续生成且不写坏的镜像 URL。
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

function ImageAssetSummary(props: {
  capabilities: CapabilitiesResponse | null;
  job: WebJob | null;
}) {
  const summary = props.job?.summary;
  const imageMode =
    typeof summary?.imageMode === "string" ? summary.imageMode : "none";
  const imageWarnings =
    typeof summary?.imageWarnings === "number" ? summary.imageWarnings : 0;
  const imagePublicBaseUrl =
    typeof summary?.imagePublicBaseUrl === "string"
      ? summary.imagePublicBaseUrl
      : props.capabilities?.imagePublicBaseUrl;

  if (!props.job && !props.capabilities?.imageAssetsConfigured) return null;
  if (imageMode === "none" && !props.capabilities?.imageAssetsConfigured)
    return null;

  return (
    <div className="image-summary">
      <div>
        <span>图片资产</span>
        <strong>{imageMode === "ssh" ? "已接入 workflow" : "未启用"}</strong>
      </div>
      <div>
        <span>公网前缀</span>
        <strong>{imagePublicBaseUrl ?? "未配置"}</strong>
      </div>
      <div>
        <span>图片 warning</span>
        <strong>{imageWarnings}</strong>
      </div>
    </div>
  );
}

function CrawlSummary(props: { job: WebJob | null }) {
  if (props.job?.type !== "goddessfantasy-board-crawl" || !props.job.summary)
    return null;
  const summary = props.job.summary;
  const mode = summary.mode === "full" ? "完全重爬" : "增量爬虫";
  const newCount = Array.isArray(summary.newTopicIds)
    ? summary.newTopicIds.length
    : numberSummary(summary, "topicsCrawled");
  const rows = [
    ["模式", mode],
    ["新增", newCount],
    ["复用", numberSummary(summary, "topicsReused")],
    ["重爬", numberSummary(summary, "topicsCrawled")],
    ["失败", numberSummary(summary, "failures")],
    ["records", numberSummary(summary, "recordsAfter")],
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
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function DownloadPanel(props: {
  singleResult: ConversionResult | null;
  job: WebJob | null;
}) {
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
    return (
      <div className="empty-state">
        运行后会在这里显示 JSON、Markdown、records 和 ZIP 下载。
      </div>
    );
  }
  const job = props.job;

  return (
    <div className="download-list">
      {job.files.length > 1 ? (
        <a
          className="download-row is-zip"
          href={`/api/jobs/${job.id}/download.zip`}
        >
          <ArchiveIcon />
          <span>全部产物</span>
          <strong>下载 ZIP</strong>
        </a>
      ) : null}
      {job.files.map((file) => (
        <a className="download-row" href={file.downloadUrl} key={file.id}>
          <DownloadIcon />
          <span>
            {intakeDownloadLabel(
              job,
              file.fileName,
              file.label || file.fileName,
            )}
          </span>
          <strong>{formatBytes(file.size)}</strong>
        </a>
      ))}
    </div>
  );
}

function intakeDownloadLabel(
  job: WebJob,
  fileName: string,
  label: string,
): string {
  if (job.type !== "ai-monster-intake" || !fileName.endsWith("-actor.json"))
    return label;
  const creatures = Array.isArray(job.summary?.creatures)
    ? (job.summary.creatures as unknown as IntakeReviewCreature[])
    : [];
  const creature = creatures.find(
    (entry) => fileName === `${entry.id}-actor.json`,
  );
  return intakeActorDownloadLabel(label, creature?.spellResolution);
}

function Warnings(props: {
  singleResult: ConversionResult | null;
  job: WebJob | null;
}) {
  const warnings = props.singleResult?.warnings ?? props.job?.warnings ?? [];
  const failures = props.job?.failures ?? [];
  return (
    <div className="warning-stack">
      {warnings.length === 0 && failures.length === 0 ? (
        <div className="success-box">暂无 warning 或失败条目。</div>
      ) : null}
      {warnings.map((warning, index) => (
        <div className="warning-row" key={`${warning}-${index}`}>
          {warning}
        </div>
      ))}
      {failures.map((failure, index) => (
        <div className="failure-row" key={`${failure.error}-${index}`}>
          <strong>
            {failure.sourceName ??
              failure.file ??
              `#${failure.index ?? index + 1}`}
          </strong>
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
      {rows.length === 0 ? (
        <div className="empty-state">暂无运行日志。</div>
      ) : null}
      {[...rows].reverse().map((entry) => (
        <div
          className={`log-row ${entry.level}`}
          key={`${entry.at}-${entry.message}`}
        >
          <span>{new Date(entry.at).toLocaleTimeString()}</span>
          <strong>{entry.level}</strong>
          <p>{entry.message}</p>
        </div>
      ))}
    </div>
  );
}

function Progress(props: { job: WebJob }) {
  const progress =
    props.job.progress.total <= 0
      ? 0
      : Math.round(
          (props.job.progress.current / props.job.progress.total) * 100,
        );
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

function Capability(props: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className={`capability ${props.tone ?? ""}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function PanelTitle(props: {
  icon?: ReactNode;
  title: string;
  detail?: string;
  actions?: ReactNode;
}) {
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

function StatusBadge(props: {
  status: "idle" | "loading" | "success" | "error";
  jobStatus?: JobStatus;
}) {
  return (
    <div className={`status-badge ${props.status}`}>
      {props.status === "loading" ? (
        <ReloadIcon className="spin" />
      ) : props.status === "success" ? (
        <CheckCircledIcon />
      ) : props.status === "error" ? (
        <CrossCircledIcon />
      ) : (
        <GlobeIcon />
      )}
      {props.jobStatus
        ? statusLabel(props.jobStatus)
        : statusLabel(props.status)}
    </div>
  );
}

export function statusLabel(
  status: JobStatus | "accepted" | "idle" | "loading" | "success" | "error",
): string {
  switch (status) {
    case "queued":
      return "排队中";
    case "running":
    case "loading":
      return "处理中";
    case "succeeded":
    case "success":
      return "已完成";
    case "partial":
      return "部分完成";
    case "needs_review":
      return "待人工确认";
    case "accepted":
      return "已接受";
    case "failed":
    case "error":
      return "失败";
    default:
      return "待运行";
  }
}

function isAcceptedFile(fileName: string, accepts: string): boolean {
  if (!accepts) return true;
  const extensions = accepts
    .split(",")
    .map((item) => item.trim().replace(/^\*/, "").toLowerCase());
  const lower = fileName.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}

function isDocumentSourceFile(fileName: string): boolean {
  return /\.(?:pdf|png|jpe?g|webp)$/i.test(fileName);
}

function downloadNameForSingle(result: ConversionResult): string {
  return `${(result.name || "foundry-json").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")}.json`;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function parseImageTokenCrops(
  text: string,
): Record<string, TokenCrop> | undefined {
  if (!text.trim()) return undefined;

  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("token-crops.json 必须是一个对象。");
  }

  const result: Record<string, TokenCrop> = {};
  for (const [hash, value] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (!/^[a-f0-9]{8}$/i.test(hash)) {
      throw new Error(`token-crops.json 的 key 必须是 8 位 hash：${hash}`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`token-crops.json 的 ${hash} 必须是 crop 对象。`);
    }
    const crop = value as Partial<TokenCrop>;
    for (const field of ["left", "top", "width", "height"] as const) {
      const numberValue = crop[field];
      if (
        typeof numberValue !== "number" ||
        !Number.isFinite(numberValue) ||
        numberValue < 0 ||
        numberValue > 1
      ) {
        throw new Error(
          `token-crops.json 的 ${hash}.${field} 必须是 0 到 1 的数字。`,
        );
      }
    }
    if (!hasCompleteNormalizedCropRect(crop)) {
      throw new Error(`token-crops.json 的 ${hash} 必须是完整 crop 对象。`);
    }
    if (
      crop.width <= 0 ||
      crop.height <= 0 ||
      crop.left + crop.width > 1 ||
      crop.top + crop.height > 1
    ) {
      throw new Error(`token-crops.json 的 ${hash} 裁剪范围必须在图片内部。`);
    }
    if (
      crop.fit !== undefined &&
      crop.fit !== "cover" &&
      crop.fit !== "contain"
    ) {
      throw new Error(
        `token-crops.json 的 ${hash}.fit 必须是 cover 或 contain。`,
      );
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
