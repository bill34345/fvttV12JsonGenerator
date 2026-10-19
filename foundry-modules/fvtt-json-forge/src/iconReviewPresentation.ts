import { decodeIconReviewReport, type IconReviewReport } from '@fvtt-json-generator/contracts/icon-review';

/** Plain text for Handlebars/textContent; never treat report names or reasons as HTML. */
export function iconReviewPresentation(reports: Array<IconReviewReport | undefined>): string {
  const available = reports.filter((report): report is IconReviewReport => !!report).map(decodeIconReviewReport);
  if (!available.length) return '此结果没有 Icon 选图报告。';
  const entries = available.flatMap(report => report.entries);
  const lowConfidence = entries.filter(entry => entry.confidence === 'fallback').length;
  const defaults = entries.filter(entry => entry.source === 'type-default').length;
  const header = `共 ${entries.length} 项图标；内容近似 ${entries.filter(entry => entry.source === 'semantic').length} 项，低把握 ${lowConfidence} 项，类型默认图 ${defaults} 项。`;
  return [header, '图标按内容或功能类别近似选择；低把握结果请结合完整规则核对。',
    ...entries.map(entry => {
      const confidence = entry.confidence === 'exact' ? '精确' : entry.confidence === 'high' ? '内容近似' : '低把握';
      const alternatives = entry.alternatives.slice(0, 3).map(candidate => `${candidate.name}（${candidate.path}）`).join('；');
      return `${entry.actorName ? `${entry.actorName} · ` : ''}${entry.itemName} [${confidence}]\n${entry.selectedPath}\n依据：${entry.reasons.join('；')}${alternatives ? `\n备选：${alternatives}` : ''}`;
    })].join('\n\n');
}
