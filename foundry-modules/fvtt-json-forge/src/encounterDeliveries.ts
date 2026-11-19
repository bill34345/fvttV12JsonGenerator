export interface EncounterDelivery {
  key: string;
  label: string;
  status: string;
  available: boolean;
  findings: readonly string[];
  source?: string;
}

export function renderEncounterDeliveries(
  deliveries: readonly EncounterDelivery[],
  options: { busy: boolean; generating: boolean; canResume: boolean },
): string {
  if (deliveries.length === 0) return '';
  const completed = deliveries.filter(delivery => delivery.available).length;
  const pending = deliveries.length - completed;
  const findingCount = deliveries.reduce((count, delivery) => count + delivery.findings.length, 0);
  const resumeLabel = pending ? `继续生成 ${pending} 只生物` : '继续准备导入';
  const rows = deliveries.map(delivery => {
    const status = delivery.available ? '已生成' : delivery.status;
    const icon = delivery.available ? 'check' : 'clock';
    return `<article class="forge-delivery-row" data-actor-delivery="${escapeHtml(delivery.key)}">
      <div class="forge-delivery-identity"><span class="forge-delivery-symbol"><i class="fas fa-dragon" aria-hidden="true"></i></span>
        <div><h3>${escapeHtml(delivery.label)}</h3><span class="forge-delivery-status"><i class="fas fa-${icon}" aria-hidden="true"></i> ${escapeHtml(status)}</span></div>
      </div>
      <div class="forge-delivery-actions">${delivery.available
        ? `<button type="button" data-actor-candidate-download="${escapeHtml(delivery.key)}"${options.busy ? ' disabled' : ''}><i class="fas fa-arrow-down" aria-hidden="true"></i> 导出生物</button>`
        : ''}</div>
      ${delivery.findings.length ? `<section class="forge-delivery-notes" aria-label="待核对的内容">
        <h4>需核对 · ${delivery.findings.length} 项</h4><p class="forge-delivery-primary-finding">${escapeHtml(delivery.findings[0]!)}</p>
        ${delivery.findings.length > 1 ? `<details><summary>其他 ${delivery.findings.length - 1} 项</summary><ul>${delivery.findings.slice(1).map(finding => `<li>${escapeHtml(finding)}</li>`).join('')}</ul></details>` : ''}
      </section>` : ''}
      ${delivery.source ? `<details class="forge-delivery-source"><summary>查看原文</summary><pre>${escapeHtml(delivery.source)}</pre></details>` : ''}
    </article>`;
  }).join('');
  return `<section class="forge-deliveries" aria-label="生物生成结果">
    <header><div><h2>生物结果</h2><p>已生成 ${completed} / ${deliveries.length}${findingCount ? ` · ${findingCount} 项待核对` : ''}${options.busy ? ' · 正在处理' : ''}</p></div>
      ${options.generating ? '<button type="button" data-action="encounter-ai-stop">停止生成</button>'
        : options.canResume ? `<button type="button" data-action="encounter-resume"${options.busy ? ' disabled' : ''}><i class="fas fa-play" aria-hidden="true"></i> ${resumeLabel}</button>` : ''}
    </header>
    <div class="forge-delivery-list">${rows}</div>
  </section>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}
