export type EffectProfile = 'core' | 'modded-v12' | 'modded-v14';
export type FvttVersion = '12' | '13' | '14';
export type IconMode = 'off' | 'safe';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'needs_review' | 'partial' | 'failed';

export type JobType =
  | 'document-convert'
  | 'monster-collection'
  | 'item-collection'
  | 'vault-sync'
  | 'translate-json'
  | 'ingest-plaintext'
  | 'ingest-plaintext-actors'
  | 'ingest-items'
  | 'ai-item-intake'
  | 'ai-monster-intake'
  | 'goddessfantasy-board-crawl'
  | 'records-to-plaintext';

export interface CapabilitiesResponse {
  pathModeEnabled: boolean;
  translationConfigured: boolean;
  monsterIntakeConfigured: boolean;
  monsterIntakeAuthMode: 'api-key' | 'codex-oauth' | null;
  goddessFantasyCookieConfigured: boolean;
  goddessFantasyLoginConfigured: boolean;
  imageAssetsConfigured: boolean;
  imageMode: 'ssh';
  imageSshTarget: string;
  imageRemoteRoot: string;
  imagePublicBaseUrl: string;
  imageAllowHttp: boolean;
  imageActorDir: string;
  imageTokenDir: string;
  imageTokenFrame: string;
  imageTokenFrameConfigured: boolean;
  imageTokenSize: number;
  imageTokenFormat: 'webp';
  publicAccess: boolean;
  limits: {
    singleUploadMb: number;
    collectionUploadMb: number;
    shortRequestsPerMinute: number;
    longJobsPerIp: number;
    tempRetentionHours: number;
  };
}

export interface DefaultsResponse {
  workspaceRoot: string;
  vaultPath: string;
  inputDir: string;
  outputDir: string;
  effectProfile: EffectProfile;
  fvttVersion: FvttVersion;
  iconMode: IconMode;
  sampleSourcePath: string;
  pathModeEnabled: boolean;
}

export interface VerificationSummary {
  sourcePath: string;
  actorPath: string;
  actor: {
    name: string;
    type: string;
  };
  items: Array<{
    name: string;
    type: string;
    activation: string;
    activityTypes: string[];
  }>;
  warnings: string[];
}

export interface ConversionResult {
  kind: 'actor' | 'item';
  sourcePath?: string;
  outputPath?: string;
  fvttVersion: FvttVersion;
  effectProfile: EffectProfile;
  name: string;
  itemCount: number;
  status: 'accepted' | 'needs_review' | 'failed';
  diagnostics: Array<{
    code: string;
    severity: 'error' | 'warning' | 'info';
    stage: 'parse' | 'ir' | 'projection' | 'schema' | 'semantic';
    path: string;
    message: string;
  }>;
  warnings: string[];
  verification: {
    status: 'accepted' | 'needs_review' | 'failed';
    diagnostics: ConversionResult['diagnostics'];
    target: unknown;
    mechanicsCoverage: unknown[];
  };
  actorVerification: VerificationSummary | null;
  rawJson: unknown;
  iconReview?: unknown;
  iconReviewPath?: string;
  downloadUrl: string;
  jobId: string;
}

export interface WebJobFile {
  id: string;
  fileName: string;
  contentType: string;
  label: string;
  size: number;
  downloadUrl: string;
}

export interface WebJob {
  id: string;
  type: JobType;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  progress: {
    current: number;
    total: number;
    label: string;
  };
  logs: Array<{
    at: string;
    level: 'info' | 'success' | 'error';
    message: string;
  }>;
  files: WebJobFile[];
  warnings: string[];
  failures: Array<{
    index?: number;
    sourceName?: string;
    file?: string;
    error: string;
  }>;
  summary: Record<string, unknown> | null;
  error?: {
    code: string;
    message: string;
  };
}

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    detail?: string;
  };
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export async function getCapabilities(): Promise<CapabilitiesResponse> {
  return request<CapabilitiesResponse>('/api/capabilities');
}

export async function getDefaults(): Promise<DefaultsResponse> {
  return request<DefaultsResponse>('/api/files/defaults');
}

export async function convertSingle(input: {
  fileName: string;
  content: string;
  fvttVersion: FvttVersion;
  effectProfile: EffectProfile;
  iconMode: IconMode;
}): Promise<ConversionResult> {
  return request<ConversionResult>('/api/convert/single', input);
}

export async function createJob(input: {
  type: JobType;
  fileName?: string;
  content?: string;
  options?: Record<string, unknown>;
}): Promise<WebJob> {
  return request<WebJob>('/api/jobs', input);
}

export async function createDocumentJob(input: {
  file: File;
  fvttVersion: FvttVersion;
  effectProfile: EffectProfile;
  iconMode: IconMode;
  engine?: 'auto' | 'native' | 'paddleocr';
  language?: 'auto' | 'en' | 'zh-CN' | 'mixed';
  targetLanguage?: string;
  candidateIds?: string[];
  extractOnly?: boolean;
}): Promise<WebJob> {
  const form = new FormData();
  form.set('file', input.file);
  form.set('fvttVersion', input.fvttVersion);
  form.set('effectProfile', input.effectProfile);
  form.set('iconMode', input.iconMode);
  form.set('engine', input.engine ?? 'auto');
  form.set('language', input.language ?? 'auto');
  form.set('targetLanguage', input.targetLanguage ?? 'zh-CN');
  form.set('candidateIds', JSON.stringify(input.candidateIds ?? []));
  form.set('extractOnly', input.extractOnly ? 'true' : 'false');
  const response = await fetch('/api/documents/convert', { method: 'POST', body: form });
  const payload = (await response.json()) as ApiResponse<WebJob>;
  if (!payload.ok) throw new Error(`${payload.error.code}: ${payload.error.message}`);
  return payload.data;
}

export async function getJob(id: string): Promise<WebJob> {
  return request<WebJob>(`/api/jobs/${id}`);
}

export async function submitIntakeDecisions(
  id: string,
  decisions: Array<{ issueId: string; action: 'select' | 'set' | 'preserve-literal' | 'exclude'; value?: unknown; note?: string }>,
): Promise<WebJob> {
  return request<WebJob>(`/api/jobs/${id}/decisions`, { decisions });
}

export async function readSourceFile(path: string): Promise<{ path: string; content: string }> {
  return request<{ path: string; content: string }>('/api/files/read', { path });
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!payload.ok) {
    throw new Error(`${payload.error.code}: ${payload.error.message}`);
  }

  return payload.data;
}
