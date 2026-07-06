export type CrawledContentType = 'monster' | 'unknown';

export type TopicClassification =
  | {
      contentType: 'monster';
      classificationSource: 'title-prefix';
      matchedPrefix: '【怪物】';
    }
  | {
      contentType: 'unknown';
      classificationSource: 'none';
    };

export interface BoardTopic {
  boardId: string;
  topicId: string;
  title: string;
  url: string;
  classification: TopicClassification;
}

export interface CrawledPost {
  index: number;
  title: string;
  author: string;
  postedAt: string;
  text: string;
  imageUrls: string[];
}

export interface CrawledTopicRecord extends BoardTopic {
  site: 'goddessfantasy';
  printUrl: string;
  rawHtmlPath: string;
  crawledAt: string;
  imageUrls: string[];
  posts: CrawledPost[];
}

export type CrawlContentTypeFilter = 'all' | CrawledContentType;
export type GoddessFantasyCrawlMode = 'full' | 'incremental';

export interface GoddessFantasyCrawlOptions {
  boardUrl: string;
  cookieHeader?: string;
  cookieHeaderFile?: string;
  cookieHeaderEnv?: string;
  loginUsername?: string;
  loginPassword?: string;
  loginUsernameEnv?: string;
  loginPasswordEnv?: string;
  saveCookieHeaderFile?: string;
  outDir?: string;
  maxBoardPages?: number;
  maxTopics?: number;
  concurrency?: number;
  requestDelayMs?: number;
  contentType?: CrawlContentTypeFilter;
  crawlMode?: GoddessFantasyCrawlMode;
  force?: boolean;
  dryRun?: boolean;
  skipAuthProbe?: boolean;
}

export interface GoddessFantasyCrawlResult {
  boardId: string;
  outDir: string;
  mode: GoddessFantasyCrawlMode;
  topicsDiscovered: number;
  topicsMatched: number;
  topicsCrawled: number;
  topicsSkipped: number;
  topicsReused: number;
  recordsBefore: number;
  recordsAfter: number;
  newTopicIds: string[];
  failures: number;
  dryRun: boolean;
}
