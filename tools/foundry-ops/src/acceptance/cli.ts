import { AcceptanceError } from './model';
import { collectAcceptance, executeAcceptance, prepareAcceptance, requireReady, resumeAcceptance } from './workflow';

export async function runAcceptanceCli(args: string[], stdout = console.log): Promise<number> {
  try {
    const [action, ...flags] = args;
    if (!action || action === '--help') {
      stdout('File-side acceptance: prepare --input=<absolute-request.json>; ready|execute|resume --contract=<absolute-contract.json>; collect --contract=<...> --receipt=<absolute-receipt.json>. Commands are reviewed local-file-checks; no Foundry or browser operations are provided.');
      return 0;
    }
    const allowed: Record<string, string[]> = { prepare: ['input'], ready: ['contract'], execute: ['contract'], collect: ['contract', 'receipt'], resume: ['contract'] };
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
      case 'prepare': {
        const contract = await prepareAcceptance(options.input!);
        const ok = contract.preflight.length === contract.request.preflight.length && contract.preflight.every(check => check.ok);
        result = { ok, contractAbsolutePath: contract.contractAbsolutePath, runId: contract.runId, instructionBaseline: contract.workspace.instructionBaseline, preflight: contract.preflight };
        exitCode = ok ? 0 : 1;
        break;
      }
      case 'ready': {
        const contract = requireReady(options.contract!);
        result = { ok: true, dispatchable: true, contractAbsolutePath: contract.contractAbsolutePath, dispatchId: contract.dispatchId, contractRevision: contract.contractRevision, workspace: contract.workspace };
        break;
      }
      case 'execute': result = await executeAcceptance(options.contract!); break;
      case 'collect': { const summary = collectAcceptance(options.contract!, options.receipt!); result = summary; exitCode = summary.exitCode; break; }
      case 'resume': { const resume = resumeAcceptance(options.contract!); result = resume; exitCode = resume.phase === 'BLOCKED' || resume.phase === 'INSPECT' ? 2 : 0; break; }
    }
    stdout(JSON.stringify(result, null, 2));
    return exitCode;
  } catch (error) {
    stdout(JSON.stringify({ ok: false, layer: error instanceof AcceptanceError ? error.layer : 'tool', reason: error instanceof Error ? error.message : String(error) }, null, 2));
    return 2;
  }
}

if (import.meta.main) process.exitCode = await runAcceptanceCli(process.argv.slice(2));
