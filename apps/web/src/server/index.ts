import { handleApiRequest } from './api';
import { createAiConnectionsRuntime } from './ai-connections/runtime';
import { extname, join, relative, resolve } from 'node:path';
import { getWebSecurityConfig } from './security/config';

const securityConfig = getWebSecurityConfig();
const aiRuntime = createAiConnectionsRuntime(securityConfig.aiConnections);
const webRoot = resolve(process.cwd(), 'dist/web');

Bun.serve<{ connectionId: string; pairingId: string }>({
  hostname: securityConfig.hostname,
  port: securityConfig.port,
  maxRequestBodySize: securityConfig.maxRequestBodyBytes,
  fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ai-companion/connect' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const pairing = aiRuntime.companion.accept(request);
      if (!pairing) return new Response('Companion pairing rejected.', { status: 403 });
      const upgraded = server.upgrade(request, { data: pairing });
      if (!upgraded) {
        aiRuntime.companion.abort(pairing.connectionId);
        return new Response('WebSocket upgrade failed.', { status: 400 });
      }
      return undefined;
    }
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, {
        remoteAddress: server.requestIP(request)?.address ?? null,
        securityConfig,
        aiRuntime,
      });
    }
    return serveStatic(url.pathname);
  },
  websocket: {
    open(socket) {
      const data = (socket as unknown as { data: { connectionId: string } }).data;
      aiRuntime.companion.open(data.connectionId, socket);
    },
    message(socket, message) {
      const data = (socket as unknown as { data: { connectionId: string } }).data;
      aiRuntime.companion.message(data.connectionId, message);
    },
    close(socket) {
      const data = (socket as unknown as { data: { connectionId: string } }).data;
      aiRuntime.companion.close(data.connectionId);
    },
  },
});

console.log(
  `fvttV12Json web listening on http://${securityConfig.hostname}:${securityConfig.port} (${securityConfig.publicMode ? 'authenticated public/proxied' : 'local'})`,
);

async function serveStatic(pathname: string): Promise<Response> {
  const filePath = resolveStaticPath(pathname);
  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file, {
      headers: {
        'content-type': contentType(filePath),
      },
    });
  }

  const index = Bun.file(join(webRoot, 'index.html'));
  if (await index.exists()) {
    return new Response(index, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    });
  }

  return new Response('web build not found. Run bun run web:build first.', { status: 404 });
}

function resolveStaticPath(pathname: string): string {
  const decoded = decodeURIComponent(pathname);
  const requested = resolve(webRoot, decoded.replace(/^\/+/, '') || 'index.html');
  const rel = relative(webRoot, requested);
  if (rel.startsWith('..') || rel.startsWith('/') || rel.startsWith('\\')) {
    return join(webRoot, 'index.html');
  }
  return requested;
}

function contentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}
