import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  CdpConnection,
  readDevToolsPort,
  waitForPageTarget,
} from './cdp';

export interface ChromeSupervisorOptions {
  chrome: string;
  profile: string;
  url: string;
  headless?: boolean;
}

export interface ChromeGeneration {
  generation: number;
  process: Bun.Subprocess;
  port: number;
  browser: CdpConnection;
  page: CdpConnection;
}

export class ChromeSupervisor {
  readonly #options: ChromeSupervisorOptions;
  #current: ChromeGeneration | null = null;
  #lastGeneration = 0;

  constructor(options: ChromeSupervisorOptions) {
    this.#options = options;
  }

  get current(): ChromeGeneration {
    if (!this.#current) throw new Error('Chrome supervisor has not launched a browser.');
    return this.#current;
  }

  get generation(): number {
    return this.#current?.generation ?? this.#lastGeneration;
  }

  get hasExited(): boolean {
    return this.#current?.process.exitCode !== null;
  }

  async launch(): Promise<ChromeGeneration> {
    if (this.#current) throw new Error('Chrome supervisor is already running.');
    return this.#launchGeneration(this.#lastGeneration + 1);
  }

  async reconnectPage(): Promise<CdpConnection> {
    const current = this.current;
    current.page.close();
    const page = await connectPage(current.port, this.#options.url);
    current.page = page;
    return page;
  }

  async relaunch(): Promise<ChromeGeneration> {
    const generation = this.generation + 1;
    await this.#disposeCurrent(false);
    return this.#launchGeneration(generation);
  }

  async terminateUnexpectedly(): Promise<void> {
    const current = this.current;
    try {
      await current.browser.send('Browser.close');
    } catch {}
    current.page.close();
    current.browser.close();
    await Promise.race([current.process.exited, Bun.sleep(3_000)]);
    if (current.process.exitCode === null) await terminateOwnedChrome(current.process);
  }

  async shutdown(): Promise<void> {
    await this.#disposeCurrent(true);
  }

  async #launchGeneration(generation: number): Promise<ChromeGeneration> {
    await mkdir(this.#options.profile, { recursive: true });
    await rm(resolve(this.#options.profile, 'DevToolsActivePort'), { force: true });
    const args = [
      this.#options.chrome,
      '--remote-debugging-port=0',
      `--user-data-dir=${this.#options.profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-component-update',
      ...(this.#options.headless ? ['--headless=new'] : ['--new-window']),
      this.#options.url,
    ];
    const process = Bun.spawn({
      cmd: args,
      stdout: 'ignore',
      stderr: 'ignore',
      windowsHide: true,
    });
    try {
      const endpoint = await readDevToolsPort(this.#options.profile);
      const browser = await CdpConnection.connect(endpoint.browserWebSocketUrl);
      const page = await connectPage(endpoint.port, this.#options.url);
      this.#current = { generation, process, port: endpoint.port, browser, page };
      this.#lastGeneration = generation;
      return this.#current;
    } catch (error) {
      await terminateOwnedChrome(process);
      throw error;
    }
  }

  async #disposeCurrent(graceful: boolean): Promise<void> {
    const current = this.#current;
    this.#current = null;
    if (!current) return;
    current.page.close();
    if (graceful && current.process.exitCode === null) {
      try {
        await current.browser.send('Browser.close');
      } catch {}
    }
    current.browser.close();
    await Promise.race([current.process.exited, Bun.sleep(3_000)]);
    if (current.process.exitCode === null) await terminateOwnedChrome(current.process);
  }
}

export async function terminateOwnedChrome(subprocess: Bun.Subprocess): Promise<void> {
  if (subprocess.exitCode !== null) return;
  if (process.platform === 'win32') {
    const taskkill = Bun.spawn({
      cmd: ['taskkill.exe', '/PID', String(subprocess.pid), '/T', '/F'],
      stdout: 'ignore',
      stderr: 'ignore',
      windowsHide: true,
    });
    await taskkill.exited;
  } else {
    subprocess.kill();
  }
  await Promise.race([subprocess.exited, Bun.sleep(5_000)]);
  if (subprocess.exitCode === null) subprocess.kill();
}

async function connectPage(port: number, url: string): Promise<CdpConnection> {
  const target = await waitForPageTarget(port, new URL(url).origin, 30_000);
  if (!target.webSocketDebuggerUrl) throw new Error('Matched target has no WebSocket debugger URL.');
  return CdpConnection.connect(target.webSocketDebuggerUrl);
}
