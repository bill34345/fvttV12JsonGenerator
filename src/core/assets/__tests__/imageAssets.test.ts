import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildWindowsPowerShellEncodedArgs, processParsedNpcImage, type ImageAssetUploader } from '../imageAssets';
import type { ParsedNPC } from '../../../config/mapping';

class RecordingUploader implements ImageAssetUploader {
  public ensured: string[] = [];
  public uploaded: Array<{ localPath: string; remotePath: string }> = [];

  public async ensureDir(remotePath: string): Promise<void> {
    this.ensured.push(remotePath);
  }

  public async uploadFile(localPath: string, remotePath: string): Promise<void> {
    this.uploaded.push({ localPath, remotePath });
  }
}

describe('buildWindowsPowerShellEncodedArgs', () => {
  it('keeps remote PowerShell syntax encoded so ssh remote shell cannot split pipes or paths', () => {
    const command = "[void](New-Item -ItemType Directory -Force -Path 'E:/Bill/imgSource/actors')";
    const args = buildWindowsPowerShellEncodedArgs(command);

    expect(args.slice(0, 4)).toEqual(['powershell', '-NoProfile', '-NonInteractive', '-EncodedCommand']);
    expect(args.join(' ')).not.toContain('|');
    expect(args.join(' ')).not.toContain('E:/Bill/imgSource/actors');
    expect(Buffer.from(args[4], 'base64').toString('utf16le')).toBe(command);
  });
});

function createParsed(img = 'https://media.example.test/nightgaunt.png'): ParsedNPC {
  return {
    name: 'Nightgaunt',
    type: 'npc',
    img,
    abilities: {},
    attributes: {},
    details: {},
    traits: {},
    skills: {},
    saves: [],
    items: [],
  };
}

describe('processParsedNpcImage', () => {
  it('mirrors actor art, generates framed token art, uploads both, and returns public URLs', async () => {
    const localRoot = mkdtempSync(join(tmpdir(), 'fvtt-image-assets-'));
    const uploader = new RecordingUploader();
    const sourceUrl = 'https://media.example.test/nightgaunt.png';
    const expectedHash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 8);
    const verifyCalls = new Map<string, number>();
    const sharp = (await import('sharp')).default;
    const sourcePng = await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 4,
        background: { r: 120, g: 20, b: 20, alpha: 1 },
      },
    }).png().toBuffer();

    try {
      const result = await processParsedNpcImage(createParsed(sourceUrl), {
        mode: 'ssh',
        localRoot,
        sshTarget: 'example-host',
        remoteRoot: 'E:/Bill/imgSource',
        publicBaseUrl: 'http://49.232.12.153/imgSource',
        allowHttp: true,
        actorDir: 'actors',
        tokenDir: 'tokens',
        tokenFramePath: resolve(process.cwd(), 'references/fifthed_border_medium.png'),
        tokenSize: 1024,
        tokenFormat: 'webp',
        fetchImage: async () => ({ buffer: sourcePng, contentType: 'image/png' }),
        uploader,
        verifyPublicImage: async (url) => {
          const calls = verifyCalls.get(url) ?? 0;
          verifyCalls.set(url, calls + 1);
          return calls > 0;
        },
      }, {
        slug: 'nightgaunt',
        displayName: 'Nightgaunt',
      });

      expect(result.warnings).toEqual([]);
      expect(result.actorUrl).toBe(`http://49.232.12.153/imgSource/actors/nightgaunt__${expectedHash}.png`);
      expect(result.tokenUrl).toBe(`http://49.232.12.153/imgSource/tokens/nightgaunt__${expectedHash}.webp`);
      expect(existsSync(result.localActorPath!)).toBe(true);
      expect(existsSync(result.localTokenPath!)).toBe(true);
      expect(uploader.ensured).toEqual([
        'E:/Bill/imgSource/actors',
        'E:/Bill/imgSource/tokens',
      ]);
      expect(uploader.uploaded.map((entry) => entry.remotePath)).toEqual([
        `E:/Bill/imgSource/actors/nightgaunt__${expectedHash}.png`,
        `E:/Bill/imgSource/tokens/nightgaunt__${expectedHash}.webp`,
      ]);

      const tokenMeta = await sharp(readFileSync(result.localTokenPath!)).metadata();
      expect(tokenMeta.width).toBe(1024);
      expect(tokenMeta.height).toBe(1024);
      expect(tokenMeta.format).toBe('webp');
    } finally {
      rmSync(localRoot, { recursive: true, force: true });
    }
  });

  it('returns warnings and no URLs when the source image cannot be downloaded', async () => {
    const localRoot = mkdtempSync(join(tmpdir(), 'fvtt-image-assets-fail-'));
    const uploader = new RecordingUploader();

    try {
      const result = await processParsedNpcImage(createParsed(), {
        mode: 'ssh',
        localRoot,
        sshTarget: 'example-host',
        remoteRoot: 'E:/Bill/imgSource',
        publicBaseUrl: 'http://49.232.12.153/imgSource',
        allowHttp: true,
        actorDir: 'actors',
        tokenDir: 'tokens',
        tokenFramePath: resolve(process.cwd(), 'references/fifthed_border_medium.png'),
        tokenSize: 1024,
        tokenFormat: 'webp',
        fetchImage: async () => {
          throw new Error('network down');
        },
        uploader,
        verifyPublicImage: async () => true,
      }, {
        slug: 'nightgaunt',
        displayName: 'Nightgaunt',
      });

      expect(result.actorUrl).toBeUndefined();
      expect(result.tokenUrl).toBeUndefined();
      expect(result.warnings).toEqual([
        expect.objectContaining({
          stage: 'download',
          message: expect.stringContaining('network down'),
        }),
      ]);
      expect(uploader.uploaded).toEqual([]);
    } finally {
      rmSync(localRoot, { recursive: true, force: true });
    }
  });

  it('returns upload warnings without public URLs when SSH upload fails', async () => {
    const localRoot = mkdtempSync(join(tmpdir(), 'fvtt-image-assets-upload-fail-'));
    const sharp = (await import('sharp')).default;
    const sourcePng = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 20, g: 120, b: 20, alpha: 1 },
      },
    }).png().toBuffer();

    try {
      const result = await processParsedNpcImage(createParsed(), {
        mode: 'ssh',
        localRoot,
        sshTarget: 'example-host',
        remoteRoot: 'E:/Bill/imgSource',
        publicBaseUrl: 'http://49.232.12.153/imgSource',
        allowHttp: true,
        actorDir: 'actors',
        tokenDir: 'tokens',
        tokenFramePath: resolve(process.cwd(), 'references/fifthed_border_medium.png'),
        tokenSize: 1024,
        tokenFormat: 'webp',
        fetchImage: async () => ({ buffer: sourcePng, contentType: 'image/png' }),
        uploader: {
          async ensureDir() {},
          async uploadFile() {
            throw new Error('scp failed');
          },
        },
        verifyPublicImage: async () => false,
      }, {
        slug: 'nightgaunt',
        displayName: 'Nightgaunt',
      });

      expect(result.actorUrl).toBeUndefined();
      expect(result.tokenUrl).toBeUndefined();
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stage: 'upload', message: expect.stringContaining('scp failed') }),
        ]),
      );
    } finally {
      rmSync(localRoot, { recursive: true, force: true });
    }
  });

  it('keeps the upper subject of tall portrait art near the token center', async () => {
    const localRoot = mkdtempSync(join(tmpdir(), 'fvtt-image-assets-tall-'));
    const uploader = new RecordingUploader();
    const sharp = (await import('sharp')).default;
    const sourcePng = await sharp({
      create: {
        width: 100,
        height: 300,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .composite([
        {
          input: Buffer.from('<svg width="100" height="300"><rect x="40" y="80" width="20" height="40" fill="red"/></svg>'),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer();

    try {
      const result = await processParsedNpcImage(createParsed(), {
        mode: 'ssh',
        localRoot,
        sshTarget: 'example-host',
        remoteRoot: 'E:/Bill/imgSource',
        publicBaseUrl: 'http://49.232.12.153/imgSource',
        allowHttp: true,
        actorDir: 'actors',
        tokenDir: 'tokens',
        tokenFramePath: resolve(process.cwd(), 'references/fifthed_border_medium.png'),
        tokenSize: 128,
        tokenFormat: 'webp',
        fetchImage: async () => ({ buffer: sourcePng, contentType: 'image/png' }),
        uploader,
        verifyPublicImage: async () => true,
      }, {
        slug: 'portrait-subject',
        displayName: 'Portrait Subject',
      });

      expect(result.warnings).toEqual([]);
      const centerPixel = await sharp(result.localTokenPath!)
        .extract({ left: 64, top: 64, width: 1, height: 1 })
        .raw()
        .toBuffer();
      expect(centerPixel[0]).toBeGreaterThan(150);
      expect(centerPixel[1]).toBeLessThan(80);
      expect(centerPixel[2]).toBeLessThan(80);
    } finally {
      try {
        rmSync(localRoot, { recursive: true, force: true });
      } catch {
        // Windows can keep sharp-read files locked for a moment after metadata extraction.
      }
    }
  });

  it('clips token source art outside the circular frame', async () => {
    const localRoot = mkdtempSync(join(tmpdir(), 'fvtt-image-assets-mask-'));
    const uploader = new RecordingUploader();
    const sharp = (await import('sharp')).default;
    const sourcePng = await sharp({
      create: {
        width: 128,
        height: 128,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    }).png().toBuffer();

    try {
      const result = await processParsedNpcImage(createParsed(), {
        mode: 'ssh',
        localRoot,
        sshTarget: 'example-host',
        remoteRoot: 'E:/Bill/imgSource',
        publicBaseUrl: 'http://49.232.12.153/imgSource',
        allowHttp: true,
        actorDir: 'actors',
        tokenDir: 'tokens',
        tokenFramePath: resolve(process.cwd(), 'references/fifthed_border_medium.png'),
        tokenSize: 128,
        tokenFormat: 'webp',
        fetchImage: async () => ({ buffer: sourcePng, contentType: 'image/png' }),
        uploader,
        verifyPublicImage: async () => true,
      }, {
        slug: 'masked-token',
        displayName: 'Masked Token',
      });

      const cornerPixel = await sharp(result.localTokenPath!)
        .ensureAlpha()
        .extract({ left: 0, top: 0, width: 1, height: 1 })
        .raw()
        .toBuffer();
      expect(cornerPixel[3]).toBeLessThan(10);
    } finally {
      try {
        rmSync(localRoot, { recursive: true, force: true });
      } catch {}
    }
  });

  it('uses source-hash crop overrides to place the selected subject in the token center', async () => {
    const localRoot = mkdtempSync(join(tmpdir(), 'fvtt-image-assets-crop-'));
    const uploader = new RecordingUploader();
    const sharp = (await import('sharp')).default;
    const sourceUrl = 'https://media.example.test/two-subjects.png';
    const sourceHash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 8);
    const sourcePng = await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .composite([
        {
          input: Buffer.from('<svg width="200" height="100"><rect x="100" y="0" width="100" height="100" fill="lime"/></svg>'),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer();

    try {
      const result = await processParsedNpcImage(createParsed(sourceUrl), {
        mode: 'ssh',
        localRoot,
        sshTarget: 'example-host',
        remoteRoot: 'E:/Bill/imgSource',
        publicBaseUrl: 'http://49.232.12.153/imgSource',
        allowHttp: true,
        actorDir: 'actors',
        tokenDir: 'tokens',
        tokenFramePath: resolve(process.cwd(), 'references/fifthed_border_medium.png'),
        tokenSize: 128,
        tokenFormat: 'webp',
        tokenCropOverrides: {
          [sourceHash]: { left: 0.5, top: 0, width: 0.5, height: 1 },
        },
        fetchImage: async () => ({ buffer: sourcePng, contentType: 'image/png' }),
        uploader,
        verifyPublicImage: async () => true,
      }, {
        slug: 'two-subjects',
        displayName: 'Two Subjects',
      });

      const centerPixel = await sharp(result.localTokenPath!)
        .extract({ left: 64, top: 64, width: 1, height: 1 })
        .raw()
        .toBuffer();
      expect(centerPixel[1]).toBeGreaterThan(140);
      expect(centerPixel[0]).toBeLessThan(120);
    } finally {
      try {
        rmSync(localRoot, { recursive: true, force: true });
      } catch {}
    }
  });

  it('prefers slug-specific crop overrides when multiple actors share one source image', async () => {
    const localRoot = mkdtempSync(join(tmpdir(), 'fvtt-image-assets-slug-crop-'));
    const uploader = new RecordingUploader();
    const sharp = (await import('sharp')).default;
    const sourceUrl = 'https://media.example.test/shared-subjects.png';
    const sourceHash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 8);
    const sourcePng = await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .composite([
        {
          input: Buffer.from('<svg width="200" height="100"><rect x="100" y="0" width="100" height="100" fill="lime"/></svg>'),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer();

    const baseOptions = {
      mode: 'ssh' as const,
      localRoot,
      sshTarget: 'example-host',
      remoteRoot: 'E:/Bill/imgSource',
      publicBaseUrl: 'http://49.232.12.153/imgSource',
      allowHttp: true,
      actorDir: 'actors',
      tokenDir: 'tokens',
      tokenFramePath: resolve(process.cwd(), 'references/fifthed_border_medium.png'),
      tokenSize: 128,
      tokenFormat: 'webp' as const,
      tokenCropOverrides: {
        [`left-subject__${sourceHash}`]: { left: 0, top: 0, width: 0.5, height: 1 },
        [`right-subject__${sourceHash}`]: { left: 0.5, top: 0, width: 0.5, height: 1 },
      },
      fetchImage: async () => ({ buffer: sourcePng, contentType: 'image/png' }),
      uploader,
      verifyPublicImage: async () => true,
    };

    try {
      const left = await processParsedNpcImage(createParsed(sourceUrl), baseOptions, {
        slug: 'left-subject',
        displayName: 'Left Subject',
      });
      const right = await processParsedNpcImage(createParsed(sourceUrl), baseOptions, {
        slug: 'right-subject',
        displayName: 'Right Subject',
      });

      const leftPixel = await sharp(left.localTokenPath!)
        .extract({ left: 64, top: 64, width: 1, height: 1 })
        .raw()
        .toBuffer();
      const rightPixel = await sharp(right.localTokenPath!)
        .extract({ left: 64, top: 64, width: 1, height: 1 })
        .raw()
        .toBuffer();
      expect(leftPixel[0]).toBeGreaterThan(140);
      expect(leftPixel[1]).toBeLessThan(120);
      expect(rightPixel[1]).toBeGreaterThan(140);
      expect(rightPixel[0]).toBeLessThan(120);
    } finally {
      try {
        rmSync(localRoot, { recursive: true, force: true });
      } catch {}
    }
  });

  it('re-uploads token art when a crop override is present even if the public URL already verifies', async () => {
    const localRoot = mkdtempSync(join(tmpdir(), 'fvtt-image-assets-crop-upload-'));
    const uploader = new RecordingUploader();
    const sharp = (await import('sharp')).default;
    const sourceUrl = 'https://media.example.test/reupload-crop.png';
    const sourceHash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 8);
    const sourcePng = await sharp({
      create: {
        width: 120,
        height: 120,
        channels: 4,
        background: { r: 30, g: 80, b: 160, alpha: 1 },
      },
    }).png().toBuffer();

    try {
      const result = await processParsedNpcImage(createParsed(sourceUrl), {
        mode: 'ssh',
        localRoot,
        sshTarget: 'example-host',
        remoteRoot: 'E:/Bill/imgSource',
        publicBaseUrl: 'http://49.232.12.153/imgSource',
        allowHttp: true,
        actorDir: 'actors',
        tokenDir: 'tokens',
        tokenFramePath: resolve(process.cwd(), 'references/fifthed_border_medium.png'),
        tokenSize: 128,
        tokenFormat: 'webp',
        tokenCropOverrides: {
          [sourceHash]: { left: 0, top: 0, width: 1, height: 1 },
        },
        fetchImage: async () => ({ buffer: sourcePng, contentType: 'image/png' }),
        uploader,
        verifyPublicImage: async () => true,
      }, {
        slug: 'reupload-crop',
        displayName: 'Reupload Crop',
      });

      expect(result.warnings).toEqual([]);
      expect(uploader.uploaded.map((entry) => entry.remotePath)).toEqual([
        `E:/Bill/imgSource/tokens/reupload-crop__${sourceHash}.webp`,
      ]);
    } finally {
      try {
        rmSync(localRoot, { recursive: true, force: true });
      } catch {}
    }
  });

  it('can contain a crop override to show more of a large subject inside the token', async () => {
    const localRoot = mkdtempSync(join(tmpdir(), 'fvtt-image-assets-contain-'));
    const uploader = new RecordingUploader();
    const sharp = (await import('sharp')).default;
    const sourceUrl = 'https://media.example.test/large-subject.png';
    const sourceHash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 8);
    const sourcePng = await sharp({
      create: {
        width: 100,
        height: 200,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 1 },
      },
    }).png().toBuffer();

    try {
      const result = await processParsedNpcImage(createParsed(sourceUrl), {
        mode: 'ssh',
        localRoot,
        sshTarget: 'example-host',
        remoteRoot: 'E:/Bill/imgSource',
        publicBaseUrl: 'http://49.232.12.153/imgSource',
        allowHttp: true,
        actorDir: 'actors',
        tokenDir: 'tokens',
        tokenFramePath: resolve(process.cwd(), 'references/fifthed_border_medium.png'),
        tokenSize: 128,
        tokenFormat: 'webp',
        tokenCropOverrides: {
          [sourceHash]: { left: 0, top: 0, width: 1, height: 1, fit: 'contain' },
        },
        fetchImage: async () => ({ buffer: sourcePng, contentType: 'image/png' }),
        uploader,
        verifyPublicImage: async () => true,
      }, {
        slug: 'large-subject',
        displayName: 'Large Subject',
      });

      const sidePixel = await sharp(result.localTokenPath!)
        .ensureAlpha()
        .extract({ left: 12, top: 64, width: 1, height: 1 })
        .raw()
        .toBuffer();
      expect(sidePixel[3]).toBeLessThan(30);
    } finally {
      try {
        rmSync(localRoot, { recursive: true, force: true });
      } catch {}
    }
  });
});
