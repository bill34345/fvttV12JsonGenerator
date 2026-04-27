import { OpenAICompatibleTranslator } from '../translation/openaiCompatible';

export interface ItemAiNormalizerOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

interface ItemAiNormalizerInternalOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

const DEFAULT_OPTIONS: ItemAiNormalizerInternalOptions = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  timeoutMs: 60000,
};

const ITEM_NORMALIZE_PROMPT = `你是一个物品数据解析专家。请将以下多阶段物品描述转换为结构化的 YAML 格式。

重要：物品有多个阶段（如 Dormant/Awakened/Exalted），每个阶段有不同的属性值。

规则：
- AC 加值：识别为 "acBonus: +N"（例如 "AC 获得 +1 加值" → acBonus: +1，"增加到 +2" → acBonus: +2）
- 充能：识别为 "uses: N"
- 水中呼吸：识别为 "waterBreathing: true"
- 游泳速度：识别为 "swimSpeed: N"
- 光照：识别为 "light: {radius: N}"
- 施展法术：识别为 "spell: {name: '法术名', uses: N}"
- 状态解除：识别为 "removeCondition: [condition1, condition2]"
- 豁免重掷：识别为 "saveReroll: true"
- 传送：识别为 "teleport: {distance: N, dc: N, damage: 'NdN'}"
- 每个阶段列出该阶段独有的能力，以及该阶段提升的数值

输入物品描述：
{{BODY}}

输出格式（只返回 YAML，不要其他内容）：
\`\`\`yaml
stages:
  - name: <阶段名称，如 Dormant/Awakened/Exalted>
    description: <该阶段的描述>
    abilities:
      - name: <能力名称>
        type: <effect|spell|use|save>
        description: <原文描述>
        acBonus: <数字>
        uses: <数字>
        waterBreathing: <true|false>
        swimSpeed: <数字>
        light: <对象>
        spell: <对象>
        removeCondition: <数组>
        saveReroll: <true|false>
        teleport: <对象>
\`\`\``;

export class ItemAiNormalizer {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly httpClient: (url: string, init: RequestInit) => Promise<Response>;

  constructor(options: ItemAiNormalizerOptions = {}) {
    const resolvedOptions: ItemAiNormalizerInternalOptions = {
      apiKey: options.apiKey ?? DEFAULT_OPTIONS.apiKey,
      baseUrl: options.baseUrl ?? DEFAULT_OPTIONS.baseUrl,
      model: options.model ?? DEFAULT_OPTIONS.model,
      timeoutMs: options.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs,
    };


    this.apiKey = resolvedOptions.apiKey;
    this.baseUrl = resolvedOptions.baseUrl;
    this.model = resolvedOptions.model;
    this.timeoutMs = resolvedOptions.timeoutMs;
    this.httpClient = fetch.bind(globalThis);
  }

  public async normalizeItem(bodyText: string): Promise<string> {
    if (!this.apiKey) {
      return 'abilities: []';
    }

    try {
      const prompt = ITEM_NORMALIZE_PROMPT.replace('{{BODY}}', bodyText);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const normalizedBaseUrl = this.baseUrl.replace(/\/+$/, '');
      const response = await this.httpClient(
        `${normalizedBaseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            temperature: 0,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
          signal: controller.signal,
        } as RequestInit,
      );

      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`AI normalization failed: HTTP ${response.status}`);
        return 'abilities: []';
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };

      const rawContent = payload.choices?.[0]?.message?.content;
      if (typeof rawContent !== 'string' || rawContent.trim().length === 0) {
        console.error('AI normalization returned empty content');
        return 'abilities: []';
      }

      const cleaned = rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      // Try to extract YAML from markdown code blocks
      let yamlContent = cleaned;
      const yamlMatch = cleaned.match(/^```(?:ya?ml)?\s*\n?([\s\S]+?)\n?```$/);
      if (yamlMatch?.[1]) {
        yamlContent = yamlMatch[1].trim();
      }

      return yamlContent;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`AI normalization error: ${error.message}`);
      }
      return 'abilities: []';
    }
  }
}
