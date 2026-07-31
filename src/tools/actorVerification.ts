import { buildActorVerificationSummary } from '../core/verification/actorVerification';

export {
  buildActorVerificationSummary,
  buildActorVerificationSummaryFromValues,
  type ActorVerificationSummary,
} from '../core/verification/actorVerification';

if (import.meta.main) {
  const [, , sourcePath, actorPath] = Bun.argv;
  if (!sourcePath || !actorPath) {
    console.error('Usage: bun run src/tools/actorVerification.ts <source.md> <actor.json>');
    process.exit(1);
  }

  const summary = buildActorVerificationSummary({ sourcePath, actorPath });
  console.log(JSON.stringify(summary, null, 2));

  if (summary.warnings.length > 0) {
    process.exitCode = 2;
  }
}
