import type { BoardTopic, CrawledPost, TopicClassification } from '../types';

type CheerioLike = any;

const TOPIC_LINK_SELECTOR = [
  '.message_index_title a[href*="topic="]:not(.new_posts)',
  '.subject a[href*="topic="]:not(.new_posts)',
  'a[href*="topic="]:not(.new_posts)',
].join(', ');

const TOPIC_ROW_SELECTOR = '.windowbg, .windowbg2, .stickybg, .lockedbg';

export function extractBoardTopics($: CheerioLike, boardUrl: string): BoardTopic[] {
  const boardId = getBoardIdFromUrl(boardUrl);
  const seen = new Set<string>();
  const topics: BoardTopic[] = [];

  $(TOPIC_ROW_SELECTOR).each((_: number, row: unknown) => {
    const link = $(row).find(TOPIC_LINK_SELECTOR).first();
    const href = link.attr('href');
    const topicId = href ? extractTopicId(href) : null;
    if (!href || !topicId || seen.has(topicId)) return;

    const canonicalUrl = canonicalTopicUrl(href, boardUrl);
    if (!canonicalUrl) return;

    seen.add(topicId);
    const title = normalizeText(link.text());
    topics.push({
      boardId,
      topicId,
      title,
      url: canonicalUrl,
      classification: classifyTopicTitle(title),
    });
  });

  return topics;
}

export function classifyTopicTitle(title: string): TopicClassification {
  if (title.trim().startsWith('【怪物】')) {
    return {
      contentType: 'monster',
      classificationSource: 'title-prefix',
      matchedPrefix: '【怪物】',
    };
  }

  return {
    contentType: 'unknown',
    classificationSource: 'none',
  };
}

export function buildPrintPageUrl(topicUrl: string): string {
  const topicId = extractTopicId(topicUrl);
  if (!topicId) {
    throw new Error(`Cannot build print page URL without topic id: ${topicUrl}`);
  }

  const url = new URL(topicUrl);
  url.search = `?action=printpage;topic=${topicId}.0`;
  url.hash = '';
  return url.toString();
}

export function parsePrintPage($: CheerioLike): CrawledPost[] {
  const headers = $('#posts .postheader').toArray();
  const bodies = $('#posts .postbody').toArray();
  const count = Math.min(headers.length, bodies.length);
  const posts: CrawledPost[] = [];

  for (let index = 0; index < count; index++) {
    const header = normalizeText($(headers[index]!).text());
    const body = normalizeText($(bodies[index]!).text());
    const parsed = parsePostHeader(header);

    posts.push({
      index,
      title: parsed.title,
      author: parsed.author,
      postedAt: parsed.postedAt,
      text: body,
      imageUrls: extractPostImageUrls($, bodies[index]!),
    });
  }

  return posts;
}

export function extractNextBoardUrls($: CheerioLike, boardUrl: string): string[] {
  const boardId = getBoardIdFromUrl(boardUrl);
  const seen = new Set<string>();
  const urls: string[] = [];

  $(`a[href*="board=${boardId}."]`).each((_: number, link: unknown) => {
    const href = $(link).attr('href');
    if (!href) return;

    const url = canonicalBoardUrl(href, boardUrl, boardId);
    if (!url || seen.has(url)) return;

    seen.add(url);
    urls.push(url);
  });

  return urls;
}

function canonicalTopicUrl(href: string, baseUrl: string): string | null {
  if (/#new\b/.test(href)) return null;

  const rawQuery = href.startsWith('http')
    ? new URL(href).search.slice(1)
    : href.replace(/^.*\?/, '');
  if (/(?:^|[?&;])(?:action|msg)=/.test(rawQuery)) return null;

  const topicId = extractTopicId(href);
  if (!topicId) return null;

  const url = new URL(href, baseUrl);
  url.search = `?topic=${topicId}.0`;
  url.hash = '';
  return url.toString();
}

function canonicalBoardUrl(href: string, baseUrl: string, boardId: string): string | null {
  const parsed = new URL(href, baseUrl);
  const query = parsed.search.slice(1);
  const boardMatch = query.match(new RegExp(`(?:^|[?&;])board=${escapeRegExp(boardId)}\\.(\\d+)(?:$|[&;#])`));
  if (!boardMatch) return null;
  if (/action=|sort=/.test(query)) return null;

  parsed.search = `?board=${boardId}.${boardMatch[1]}`;
  parsed.hash = '';
  return parsed.toString();
}

export function getBoardIdFromUrl(boardUrl: string): string {
  const query = new URL(boardUrl).search.slice(1);
  const match = query.match(/(?:^|[?&;])board=(\d+)(?:\.\d+)?(?:$|[&;#])/);
  if (!match) {
    throw new Error(`Cannot extract board id from URL: ${boardUrl}`);
  }
  return match[1]!;
}

function extractTopicId(href: string): string | null {
  const raw = href.startsWith('http') ? new URL(href).search.slice(1) : href;
  const match = raw.match(/(?:^|[?&;])topic=(\d+)(?:\.|$|[&;#])/);
  return match?.[1] ?? null;
}

function parsePostHeader(header: string): Omit<CrawledPost, 'index' | 'text' | 'imageUrls'> {
  const match = header.match(/^标题:\s*(.*?)\s+作者:\s*(.*?)\s+于\s*(.*?)$/);
  return {
    title: match?.[1]?.trim() ?? '',
    author: match?.[2]?.trim() ?? '',
    postedAt: match?.[3]?.trim() ?? '',
  };
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractPostImageUrls($: CheerioLike, body: unknown): string[] {
  const urls = new Set<string>();
  const bodyNode = $(body);

  for (const url of extractImageUrlsFromText(bodyNode.html() ?? '')) {
    urls.add(url);
  }

  for (const url of extractImageUrlsFromText(bodyNode.text())) {
    urls.add(url);
  }

  bodyNode
    .find('img[src]')
    .each((_: number, image: unknown) => {
      const src = $(image).attr('src');
      if (src) urls.add(src.trim());
    });

  bodyNode
    .find('a[href]')
    .each((_: number, link: unknown) => {
      const href = $(link).attr('href')?.trim();
      if (href && isImageUrl(href)) urls.add(href);
    });

  return [...urls];
}

function extractImageUrlsFromText(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s<>"')]+?\.(?:avif|gif|jpe?g|png|webp)(?:[?#][^\s<>"')]+)?/gi);
  return urls?.map((url) => url.trim()) ?? [];
}

function isImageUrl(url: string): boolean {
  return /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(url);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
