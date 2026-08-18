import { handleApiRequest } from './api';
import { createAiConnectionsRuntime } from './ai-connections/runtime';
import { extname, join, relative, resolve } from 'node:path';
import { getWebSecurityConfig } from './security/config';

const securityConfig = getWebSecurityConfig();
const aiRuntime = createAiConnectionsRuntime(securityConfig.aiConnections);
const webRoot = resolve(process.cwd(), 'dist/web');

interface CompanionSocketData {
  pendingId?: string;
  connectionId?: string;
  pendingTimer?: ReturnType<typeof setTimeout>;
}

Bun.serve<CompanionSocketData>({
  hostname: securityConfig.hostname,
  port: securityConfig.port,
  maxRequestBodySize: securityConfig.maxRequestBodyBytes,
  fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ai-companion/connect' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const pending = aiRuntime.companion.createPending(request);
      if (!pending) return new Response('Companion pairing rejected.', { status: 403 });
      const upgraded = server.upgrade(request, { data: pending });
      if (!upgraded) aiRuntime.companion.cancelPending(pending.pendingId);
      if (!upgraded) return new Response('WebSocket upgrade failed.', { status: 400 });
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
      const data = socket.data;
      if (!data.pendingId) return;
      data.pendingTimer = setTimeout(() => {
        if (!data.pendingId) return;
        aiRuntime.companion.cancelPending(data.pendingId);
        data.pendingId = undefined;
        socket.close(1008, 'Companion pairing handshake timed out.');
      }, 10_000);
    },
    message(socket, message) {
      const data = socket.data;
      if (data.pendingId) {
        const pairing = aiRuntime.companion.acceptPending(data.pendingId, message);
        if (!pairing) {
          aiRuntime.companion.cancelPending(data.pendingId);
          data.pendingId = undefined;
          socket.close(1008, 'Companion pairing rejected.');
          return;
        }
        if (data.pendingTimer) clearTimeout(data.pendingTimer);
        data.pendingTimer = undefined;
        data.pendingId = undefined;
        data.connectionId = pairing.connectionId;
        aiRuntime.companion.open(pairing.connectionId, socket);
        return;
      }
      if (data.connectionId) aiRuntime.companion.message(data.connectionId, message);
    },
    close(socket) {
      const data = socket.data;
      if (data.pendingTimer) clearTimeout(data.pendingTimer);
      if (data.pendingId) aiRuntime.companion.cancelPending(data.pendingId);
      if (data.connectionId) aiRuntime.companion.close(data.connectionId);
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
