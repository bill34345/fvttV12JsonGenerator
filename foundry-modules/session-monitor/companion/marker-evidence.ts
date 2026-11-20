import { SAMPLE_INTERVAL_MS, type BrowserSignal, type BrowserSignalKind, type CombatControl,
  type MonitorEvent, type MonitorEventKind, type SessionExport } from '../src/schema';

const BEFORE_MS = 60_000;
const AFTER_MS = 10_000;
const controls: Record<CombatControl, string> = {
  'start-combat': '开战',
  'next-turn': '下一回合',
  'roll-initiative': '掷先攻',
};
const eventNames: Partial<Record<MonitorEventKind, string>> = {
  'combat-control': '点击战斗按钮',
  'combat-start': '开始战斗',
  'combat-update': '收到战斗更新',
  'combat-tracker-render': '战斗列表重绘结束',
  'combat-turn': '开始换回合',
  'combat-round': '开始换轮',
  'canvas-ready': '画布就绪',
  'canvas-teardown': '画布卸载',
  'scene': '场景事件',
  'online': '浏览器恢复在线',
  'offline': '浏览器转为离线',
  'webgl-context-lost': 'WebGL 上下文丢失',
  'webgl-context-restored': 'WebGL 上下文恢复',
  'visibility': '页面可见性变化',
  'session-resume': '恢复记录',
  'page-hide': '离开页面',
  'capability-gap': '采集能力缺失',
};
const signalNames: Record<BrowserSignalKind, string> = {
  'frame-gap': '帧间隔',
  'long-task': '主线程长任务',
  'long-frame': '长动画帧',
  interaction: '慢交互',
  resource: '资源请求',
};
const clock = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
});

interface TimelineRow {
  at: number;
  text: string;
}

export function renderMarkerEvidence(session: SessionExport, marker: MonitorEvent): string[] {
  const at = Date.parse(marker.timestamp);
  const sessionStart = Date.parse(session.session.startedAt);
  const from = Math.max(sessionStart, at - BEFORE_MS);
  const until = Math.min(session.session.endedAt ? Date.parse(session.session.endedAt) : Infinity, at + AFTER_MS);
  const samples = session.samples.filter(sample => {
    const endedAt = Date.parse(sample.timestamp);
    return (endedAt >= from && endedAt <= until + SAMPLE_INTERVAL_MS)
      || sample.browserEvidence?.records.some(signal => signal.startMs >= sessionStart && overlapsWindow(signal, from, until));
  });
  const windows = samples.flatMap(sample => sample.browserEvidence ? [sample.browserEvidence] : []);
  const rows = ['### ' + clock.format(new Date(at)), '', '以下为标记前 60 秒到标记后 10 秒的 GM 页记录。'];
  const timeline: TimelineRow[] = [];
  for (const event of session.events) {
    const at = Date.parse(event.timestamp);
    const label = eventNames[event.kind];
    if (!label || at < from || at > until) continue;
    const timing = event.combatTiming;
    const context = [event.sceneAlias, event.combatAlias].filter(Boolean).join('／');
    const elapsed = timing ? '「' + controls[timing.control] + '」，点击后 ' + timing.sinceClickMs + ' ms' : '';
    const round = event.round == null ? '' : '第 ' + event.round + ' 轮' + (event.turn == null ? '' : '，回合索引 ' + event.turn);
    const details = [elapsed, context, round, event.detail].filter(Boolean).map(mdText);
    timeline.push({ at, text: label + (details.length ? ' · ' + details.join('，') : '') });
  }
  for (const error of session.errors) {
    const at = Date.parse(error.timestamp);
    if (at < from || at > until) continue;
    const packages = error.packageIds.length ? ' · ' + error.packageIds.map(mdText).join('、') : '';
    const frame = error.frames[0] ? ' · ' + mdText(error.frames[0].trim()) : '';
    timeline.push({ at, text: '错误 · ' + mdText(error.source) + '／' + mdText(error.name) + packages + frame
      + ' · 指纹 ' + mdText(error.fingerprint.slice(0, 12)) });
  }
  for (const window of windows) {
    for (const signal of window.records) {
      if (signal.startMs < sessionStart || !overlapsWindow(signal, from, until)) continue;
      timeline.push({ at: signal.startMs, text: describeSignal(signal) });
    }
  }
  if (!windows.length) {
    rows.push('', '这段导出没有浏览器明细。现有采样窗保留以下峰值。');
    for (const sample of samples) {
      const at = Date.parse(sample.timestamp);
      if (at > until) continue;
      const frame = sample.frames.maxMs == null ? '帧间隔缺失' : '帧间隔峰值 ' + Math.round(sample.frames.maxMs) + ' ms';
      const task = sample.capabilityGaps.includes('PerformanceObserver.longtask') ? '长任务缺失'
        : '最长任务 ' + Math.round(sample.longTasks.maxMs) + ' ms';
      timeline.push({ at, text: '采样窗结束 · ' + [frame, task, sample.sceneAlias].filter(Boolean).join('，') });
    }
  }
  const unavailable = new Set(windows.flatMap(window => window.unavailable));
  const omitted = new Map<BrowserSignalKind, number>();
  for (const window of windows) {
    for (const [kind, count] of Object.entries(window.omitted)) {
      const source = kind as BrowserSignalKind;
      omitted.set(source, (omitted.get(source) ?? 0) + count);
    }
  }
  if (unavailable.size) rows.push('', '部分采样窗缺少 ' + [...unavailable].map(kind => signalNames[kind]).join('、') + '。');
  if (omitted.size) rows.push('', '相关采样窗达到容量上限，未保留的条目数 · '
    + [...omitted].map(([kind, count]) => signalNames[kind] + ' ' + count).join('、') + '。');
  rows.push('');
  timeline.sort((left, right) => left.at - right.at);
  if (!timeline.length) rows.push('- 这一时段没有留下上述时间线记录。');
  for (const item of timeline) rows.push('- ' + clock.format(new Date(item.at)) + ' · ' + item.text);
  rows.push('');
  return rows;
}

function overlapsWindow(signal: BrowserSignal, from: number, until: number): boolean {
  return signal.startMs <= until && signal.startMs + signal.durationMs >= from;
}

function describeSignal(signal: BrowserSignal): string {
  const duration = signalNames[signal.kind] + ' ' + signal.durationMs + ' ms';
  switch (signal.kind) {
    case 'long-frame': {
      const scripts = signal.scripts.map(script =>
        (script.owner ? mdText(script.owner) : '来源未知') + ' ' + script.durationMs
        + ' ms' + (script.forcedLayoutMs ? '（强制布局 ' + script.forcedLayoutMs + ' ms）' : ''));
      const layout = signal.layoutOffsetMs === undefined ? '' : '，布局从帧开始后 ' + signal.layoutOffsetMs + ' ms 起';
      return duration + '，阻塞 ' + signal.blockingMs + ' ms' + layout + (scripts.length ? ' · ' + scripts.join('、') : '');
    }
    case 'interaction':
      return duration + ' · ' + mdText(signal.event) + '，处理前等待 ' + signal.inputDelayMs + ' ms，处理 ' + signal.handlerMs + ' ms';
    case 'resource':
      return duration + ' · ' + [signal.initiator, signal.owner, signal.status ? 'HTTP ' + signal.status : '状态未提供']
        .filter(Boolean).map(mdText).join('／');
    default:
      return duration;
  }
}

function mdText(value: unknown): string {
  return String(value).replace(/[\r\n\t]/g, ' ').replace(/[\\<>\[\]*]/g, '\\$&');
}
