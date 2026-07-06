import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import * as cheerio from 'cheerio';

export interface GoddessFantasyLoginOptions {
  boardUrl: string;
  username?: string;
  password?: string;
  usernameEnv?: string;
  passwordEnv?: string;
  saveCookieHeaderFile?: string;
}

export interface GoddessFantasyLoginResult {
  cookieHeader: string;
  cookieNames: string[];
  savedCookieHeaderFile?: string;
}

export interface GoddessFantasyAuthProbeResult {
  ok: boolean;
  status: number;
  title: string;
  bodyClass: string;
  topicCount: number;
  monsterMarkerCount: number;
  reason?: string;
}

const DEFAULT_USERNAME_ENV = 'GODDESSFANTASY_USERNAME';
const DEFAULT_PASSWORD_ENV = 'GODDESSFANTASY_PASSWORD';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

export function defaultRequestHeaders(cookieHeader: string): Record<string, string> {
  return {
    Cookie: cookieHeader,
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };
}

export async function loginGoddessFantasy(
  options: GoddessFantasyLoginOptions,
): Promise<GoddessFantasyLoginResult> {
  const username = loadCredential(
    options.username,
    options.usernameEnv ?? DEFAULT_USERNAME_ENV,
    'username',
  );
  const password = loadCredential(
    options.password,
    options.passwordEnv ?? DEFAULT_PASSWORD_ENV,
    'password',
  );
  const baseUrl = new URL(options.boardUrl);
  const siteRoot = `${baseUrl.protocol}//${baseUrl.host}`;
  const bbsRoot = `${siteRoot}/bbs/`;
  const jar = new CookieJar();
  const client = new GoddessFantasyHttpClient(jar);

  const loginUrl = new URL('index.php?action=login', bbsRoot).toString();
  const loginResponse = await client.request(loginUrl);
  const loginHtml = await loginResponse.text();
  const $ = cheerio.load(loginHtml);
  const form = $('form')
    .filter((_, element) => ($(element).attr('action') ?? '').includes('action=login2'))
    .first();

  const action = form.attr('action');
  if (!action) {
    throw new Error('Could not find GoddessFantasy login form action.');
  }

  const body = new URLSearchParams();
  form.find('input[name]').each((_, input) => {
    const name = $(input).attr('name');
    if (!name) return;
    body.set(name, $(input).attr('value') ?? '');
  });
  body.set('user', username);
  body.set('passwrd', password);
  body.set('cookielength', '-1');

  const actionUrl = new URL(action, bbsRoot).toString();
  const login2Response = await client.request(actionUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      Origin: siteRoot,
      Referer: loginUrl,
    },
    body,
  });

  const location = login2Response.headers.get('location');
  if (location) {
    await client.request(new URL(location, actionUrl).toString(), {
      headers: { Referer: actionUrl },
    });
  } else {
    const login2Html = await login2Response.text();
    if (login2Html.includes('name="passwrd"') || login2Html.includes('登录')) {
      throw new Error('GoddessFantasy login did not redirect after credential submission.');
    }
  }

  const cookieHeader = jar.toHeader();
  if (!cookieHeader.includes('SMFCookieElle=')) {
    throw new Error('GoddessFantasy login did not produce an SMF session cookie.');
  }

  let savedCookieHeaderFile: string | undefined;
  if (options.saveCookieHeaderFile) {
    savedCookieHeaderFile = resolvePath(options.saveCookieHeaderFile);
    ensureDir(dirname(savedCookieHeaderFile));
    writeFileSync(savedCookieHeaderFile, cookieHeader, 'utf-8');
  }

  return {
    cookieHeader,
    cookieNames: jar.names(),
    savedCookieHeaderFile,
  };
}

export async function probeGoddessFantasyAuth(
  boardUrl: string,
  cookieHeader: string,
): Promise<GoddessFantasyAuthProbeResult> {
  const response = await fetchWithRetries(boardUrl, {
    headers: defaultRequestHeaders(cookieHeader),
    redirect: 'follow',
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  const title = $('title').text().trim();
  const bodyClass = $('body').attr('class') ?? '';
  const topicCount = $('a')
    .toArray()
    .filter((link) => ($(link).attr('href') ?? '').includes('topic=')).length;
  const monsterMarkerCount = html.split('【怪物】').length - 1;
  const looksLoggedOut =
    title === '登录' || html.includes('name="passwrd"') || html.includes('name="user"');

  if (looksLoggedOut) {
    return {
      ok: false,
      status: response.status,
      title,
      bodyClass,
      topicCount,
      monsterMarkerCount,
      reason: 'received login page',
    };
  }

  if (!bodyClass.includes('action_messageindex')) {
    return {
      ok: false,
      status: response.status,
      title,
      bodyClass,
      topicCount,
      monsterMarkerCount,
      reason: 'board page marker not found',
    };
  }

  if (topicCount === 0) {
    return {
      ok: false,
      status: response.status,
      title,
      bodyClass,
      topicCount,
      monsterMarkerCount,
      reason: 'no topic links found',
    };
  }

  return {
    ok: true,
    status: response.status,
    title,
    bodyClass,
    topicCount,
    monsterMarkerCount,
  };
}

export function loadCookieHeaderFile(path: string): string {
  return readFileSync(resolvePath(path), 'utf-8').trim();
}

class GoddessFantasyHttpClient {
  constructor(private readonly jar: CookieJar) {}

  async request(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers ?? {});
    headers.set('User-Agent', USER_AGENT);
    headers.set('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8');
    headers.set('Accept', headers.get('Accept') ?? 'text/html,application/xhtml+xml,*/*');

    const cookieHeader = this.jar.toHeader();
    if (cookieHeader) headers.set('Cookie', cookieHeader);

    const response = await fetchWithRetries(url, {
      ...init,
      headers,
      redirect: 'manual',
    });

    this.jar.store(response);
    return response;
  }
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  store(response: Response): void {
    for (const cookie of getSetCookieHeaders(response)) {
      const pair = cookie.split(';', 1)[0] ?? '';
      const index = pair.indexOf('=');
      if (index <= 0) continue;
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }

  toHeader(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  names(): string[] {
    return [...this.cookies.keys()];
  }
}

function getSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.();
  if (values?.length) return values;

  const merged = response.headers.get('set-cookie');
  return merged ? splitMergedSetCookieHeader(merged) : [];
}

function splitMergedSetCookieHeader(header: string): string[] {
  return header.split(/,(?=\s*[^;,=\s]+=[^;,]*)/g).map((value) => value.trim());
}

async function fetchWithRetries(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
    }
  }
  throw lastError;
}

function loadCredential(value: string | undefined, envName: string, label: string): string {
  const resolved = value?.trim() || process.env[envName]?.trim();
  if (!resolved) {
    throw new Error(
      `GoddessFantasy login ${label} is required. Provide the CLI option or set ${envName}.`,
    );
  }
  return resolved;
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}
