import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { localizationHash } from '@fvtt-json-generator/contracts/localization';
import {sanitizeFailureReply,type TransportFailureEvidence,type TransportFailureDiagnostic} from './transport-failure-evidence';

/** Deterministic syntax recovery only. Hashes bind the complete original
 * response and the unchanged JSON object; the discarded tail is punctuation. */
export interface ProviderJsonFormatRecovery {
  version:1;
  kind:'drop-json-terminal-delimiters';
  originalResponseHash:string;
  parsedObjectHash:string;
  objectLength:number;
  /** One/two closers (legacy interstitial whitespace allowed), or quote+closer. */
  removedTail:string;
}

/** Opt-in diagnostic data, never part of a Forge response, bundle or audit log.
 * The owner must choose a private sink. Capturing a reply does not approve it. */
export interface ProviderResponseEvidence {
  version: 1;
  stage: 'discover' | 'extract' | 'repair' | 'review' | 'translate' | 'translation-review' | 'automation-generate' | 'automation-review';
  sourceHash: string;
  requestHash: string;
  localizationRequestHash?: string;
  textIds?: readonly string[];
  model: string;
  attempt: number;
  responseHash: string;
  content: string;
  truncated: boolean;
  redacted: boolean;
  kind?: 'transport-failure';
  transportFailure?: Omit<TransportFailureDiagnostic,'evidenceStatus'>;
  formatRecovery?:ProviderJsonFormatRecovery;
}

/** Same private sink as content evidence, but runs when framing/parsing never produced content. */
export function failureEvidenceRecorder(
  sink:ProviderResponseEvidenceSink|undefined,
  context:Pick<ProviderResponseEvidence,'stage'|'sourceHash'|'model'|'attempt'|'localizationRequestHash'|'textIds'>,
  requestIdentity:unknown,forbidden:readonly string[],
):((failure:TransportFailureEvidence)=>Promise<boolean>)|undefined {
  if(!sink)return undefined;
  return async failure=>{
    try {
      const content=sanitizeFailureReply(failure.content,forbidden);
      await sink.record({...context,model:sanitizeFailureReply(context.model,forbidden),version:1,kind:'transport-failure',
        requestHash:localizationHash(requestIdentity),responseHash:failure.capturedBodyHash,content,
        truncated:failure.diagnostic.captureTruncated,redacted:failure.redacted||content!==failure.content,
        transportFailure:failure.diagnostic});
      return true;
    }catch {
      try{sink.onStorageFailure?.();}catch{/* Storage failure never sends another provider request. */}
      return false;
    }
  };
}

export interface ProviderResponseEvidenceSink {
  record(evidence: ProviderResponseEvidence): void | Promise<void>;
  /** Storage failures are separate from provider/validation failures. No raw error is supplied. */
  onStorageFailure?(): void;
}

/** Run immediately after transport framing, before any JSON/IR/token rejection.
 * Local JSON syntax analysis may attach its bounded recovery receipt.
 * A broken evidence sink must not trigger another model request. No filesystem,
 * credential discovery or default logging exists at this boundary. */
export async function captureProviderResponse(
  sink: ProviderResponseEvidenceSink | undefined,
  context: Omit<ProviderResponseEvidence, 'version' | 'requestHash' | 'responseHash' | 'content' | 'truncated' | 'redacted'>,
  requestIdentity: unknown,
  content: string,
  forbiddenValues: readonly string[],
): Promise<void> {
  if (!sink) return;
  try {
    const clean = (value: string) => {
      let safe = value;
      for (const forbidden of forbiddenValues) if (forbidden) safe = safe.split(forbidden).join('[redacted]');
      return safe.replace(/\bBearer\s+\S+/giu, 'Bearer [redacted]')
        .replace(/(["']?(?:api[-_]?key|authorization|cookie|password|credential|secret)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]]+)/giu, '$1"[redacted]"');
    };
    const cleaned = clean(content);
    const limit = 1_000_000;
    await sink.record({ ...context, model: clean(context.model), version: 1,
      requestHash: localizationHash(requestIdentity), responseHash: sha256(content),
      content: cleaned.slice(0, limit), truncated: cleaned.length > limit, redacted: cleaned !== content });
  } catch {
    try { sink.onStorageFailure?.(); } catch { /* Diagnostics cannot alter provider semantics. */ }
  }
}
