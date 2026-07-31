const api = Bun.spawn({
  cmd: ['bun', 'run', 'apps/web/src/server/index.ts'],
  stdout: 'inherit',
  stderr: 'inherit',
});

const vite = Bun.spawn({
  cmd: ['bunx', 'vite', '--host', '127.0.0.1'],
  stdout: 'inherit',
  stderr: 'inherit',
});

const shutdown = () => {
  api.kill();
  vite.kill();
};

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

await Promise.race([api.exited, vite.exited]);
shutdown();
