import { AcceptanceError } from './model';
import { collectAcceptance, executeAcceptance, loadContract, prepareAcceptance, requireReady, resumeAcceptance } from './workflow';
import { captureExternalReceipt, externalReadiness, importExternalReceipt, prepareExternalBatch } from './external';
import { inspectNextVmSource } from './adapters/next-vision-macro';
import { collectRuntimeBatch, dispatchRuntimeBatch, prepareRuntimeBatch, runtimeReadiness } from './runtime';

export async function runAcceptanceCli(args: string[], stdout = console.log): Promise<number> {
  try {
    const [action, ...flags] = args;
    if (!action || action === '--help') {
      stdout('Acceptance: prepare|prepare-batch|prepare-runtime --input=<absolute-request.json>; ready|ready-batch|ready-runtime|claim-runtime|execute|resume --contract=<absolute-contract.json>; collect --contract=<...> --receipt=<...>; inspect-batch --source=<source-contract.json>; capture-receipt --contract=<...> --input=<native.json> --context=<observed-context.json>; import-receipt|collect-runtime --contract=<...> --input=<saved-evidence.json>. Runtime is a separate explicitly resumed local Next Vision/Macro scope; Chrome messaging remains with the authorized host.');
      return 0;
    }
    const allowed: Record<string, string[]> = { prepare: ['input'], ready: ['contract'], execute: ['contract'], collect: ['contract', 'receipt'], resume: ['contract'], 'inspect-batch': ['source'], 'prepare-batch': ['input'], 'ready-batch': ['contract'], 'capture-receipt': ['contract', 'input', 'context'], 'import-receipt': ['contract', 'input'], 'prepare-runtime': ['input'], 'ready-runtime': ['contract'], 'claim-runtime': ['contract'], 'collect-runtime': ['contract', 'input'] };
    if (!allowed[action]) throw new AcceptanceError('precondition', `Unsupported acceptance action: ${action}`);
    const options: Record<string, string> = {};
    for (const flag of flags) {
      const match = /^--([^=]+)=(.+)$/.exec(flag);
      if (!match || !allowed[action]!.includes(match[1]!) || options[match[1]!] !== undefined) throw new AcceptanceError('precondition', `Unknown, repeated or empty option: ${flag}`);
      options[match[1]!] = match[2]!;
    }
    for (const key of allowed[action]!) if (!options[key]) throw new AcceptanceError('precondition', `Missing --${key}=<absolute-path>`);
    let result: unknown;
    let exitCode = 0;
    switch (action) {
      case 'prepare-runtime': result = await prepareRuntimeBatch(options.input!); break;
      case 'ready-runtime': result = await runtimeReadiness(options.contract!); break;
      case 'claim-runtime': result = await dispatchRuntimeBatch(options.contract!, async ready => ({ ...ready, phase: 'CLAIMED', transport: 'NOT_SENT', runtime: 'NOT_EXECUTED' })); break;
      case 'collect-runtime': result = collectRuntimeBatch(options.contract!, options.input!); exitCode = 2; break;
      case 'inspect-batch': result = inspectNextVmSource(options.source!); break;
      case 'prepare-batch': {
        const contract = await prepareExternalBatch(options.input!);
        const ok = contract.preflight.length === contract.request.preflight.length && contract.preflight.every(check => check.ok);
        result = { ok, contractAbsolutePath: contract.contractAbsolutePath, runId: contract.runId, instructionBaseline: contract.workspace.instructionBaseline, runtimeDispatchable: false, sourceDispatchId: contract.request.externalBatch!.sourceDispatchId };
        exitCode = ok ? 0 : 1; break;
      }
      case 'ready-batch': result = externalReadiness(options.contract!); exitCode = 2; break;
      case 'capture-receipt': result = captureExternalReceipt(options.contract!, options.input!, options.context!); break;
      case 'import-receipt': result = importExternalReceipt(options.contract!, options.input!); exitCode = 2; break;
      case 'prepare': {
        const contract = await prepareAcceptance(options.input!);
        const ok = contract.preflight.length === contract.request.preflight.length && contract.preflight.every(check => check.ok);
        result = { ok, contractAbsolutePath: contract.contractAbsolutePath, runId: contract.runId, instructionBaseline: contract.workspace.instructionBaseline, preflight: contract.preflight };
        exitCode = ok ? 0 : 1;
        break;
      }
      case 'ready': {
        const contract = requireReady(options.contract!);
        result = { ok: true, dispatchable: true, executionScope: 'local-file-checks', ...(contract.request.externalBatch ? { runtimeDispatchable: false } : {}), contractAbsolutePath: contract.contractAbsolutePath, dispatchId: contract.dispatchId, contractRevision: contract.contractRevision, workspace: contract.workspace };
        break;
      }
      case 'execute': result = await executeAcceptance(options.contract!); break;
      case 'collect': { const summary = collectAcceptance(options.contract!, options.receipt!); result = summary; exitCode = summary.exitCode; break; }
      case 'resume': { const resume = resumeAcceptance(options.contract!); const contract = loadContract(options.contract!); result = { ...resume, ...(contract.request.externalBatch ? { runtime: externalReadiness(options.contract!) } : {}) }; exitCode = resume.phase === 'BLOCKED' || resume.phase === 'INSPECT' ? 2 : 0; break; }
    }
    stdout(JSON.stringify(result, null, 2));
    return exitCode;
  } catch (error) {
    stdout(JSON.stringify({ ok: false, layer: error instanceof AcceptanceError ? error.layer : 'tool', reason: error instanceof Error ? error.message : String(error) }, null, 2));
    return 2;
  }
}


if (import.meta.main) process.exitCode = await runAcceptanceCli(process.argv.slice(2));
