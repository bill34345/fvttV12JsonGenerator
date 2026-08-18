const build = Bun.spawn({
  cmd: ['bunx', 'vite', 'build'],
  stdout: 'inherit',
  stderr: 'inherit',
});

const buildExitCode = await build.exited;
if (buildExitCode !== 0) {
  process.exit(buildExitCode);
}

// The page-guided Companion flow depends on a matching executable. Build it
// before starting the server so a failed build can never leave a stale page
// running against a missing or incompatible artifact.
const companionBuild = Bun.spawn({
  cmd: ['bun', 'run', 'web:companion:build'],
  stdout: 'inherit',
  stderr: 'inherit',
});
const companionBuildExitCode = await companionBuild.exited;
if (companionBuildExitCode !== 0) {
  process.exit(companionBuildExitCode);
}

// Local development is loopback-only by default. An explicit value, including
// 0, always wins; public/proxied starts must opt in at the operator boundary.
if (Bun.env.FVTT_WEB_PUBLIC_MODE !== '1' && Bun.env.FVTT_WEB_CODEX_COMPANION_ENABLED === undefined) {
  Bun.env.FVTT_WEB_CODEX_COMPANION_ENABLED = '1';
}

// Development uses one stable origin. The API server also serves the built
// frontend, so browser requests and API requests share http://127.0.0.1:5173.
Bun.env.FVTT_WEB_API_PORT = '5173';
await import('./server/index.ts');
