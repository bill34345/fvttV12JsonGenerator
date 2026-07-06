import { handleApiRequest } from './api';
import { extname, join, relative, resolve } from 'node:path';

const port = Number(Bun.env.FVTT_WEB_API_PORT ?? 5174);
const webRoot = resolve(process.cwd(), 'dist/web');

Bun.serve({
  port,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApiRequest(request);
    return serveStatic(url.pathname);
  },
});

console.log(`fvttV12Json web listening on http://localhost:${port}`);

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
