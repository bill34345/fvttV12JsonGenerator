import type {
  EvidenceRef,
  SpellManualDecision,
  SpellResolutionFinding,
} from '../../core/spell-resolution';

export interface ResolverReviewCandidate {
  packageId: string;
  packId: string;
  sourceBook?: string;
  rules?: string;
  level?: number;
  uuid: string;
}

export interface ResolverReviewSpell {
  logicalRefKey: string;
  refId: string;
  originalName: string;
  evidence: EvidenceRef[];
  sourceEvidence?: EvidenceRef[];
  candidates: ResolverReviewCandidate[];
  current?: unknown;
  lastGeneratedProof?: unknown;
  proposed?: unknown;
  manualConflict?: { keepable: boolean; explanation?: string };
  warnings: string[];
  literalRestrictions: Array<{ kind: string; text: string }>;
  blocking: boolean;
}

export interface ResolverReviewModel {
  manifestId: string;
  findingHash: string;
  title: string;
  findings: SpellResolutionFinding[];
  spells: ResolverReviewSpell[];
}

export interface ResolverCandidateSelection {
  logicalRefKey: string;
  selectedUuid: string;
}

export type ResolverReviewOutcome =
  | { action: 'cancel' }
  | { action: 'apply'; manualDecisions: SpellManualDecision[]; candidateSelections: ResolverCandidateSelection[] };

export interface ResolverReviewSession {
  readonly manualChoices: readonly ['keep', 'overwrite', 'cancel'];
  decideManual(logicalRefKey: string, decision: SpellManualDecision['decision']): void;
  selectCandidate(logicalRefKey: string, selectedUuid: string): void;
  canApply(): boolean;
  apply(): ResolverReviewOutcome;
  cancel(): ResolverReviewOutcome;
  close(): ResolverReviewOutcome;
}

export function createResolverReviewSession(model: ResolverReviewModel): ResolverReviewSession {
  const manualDecisions = new Map<string, SpellManualDecision['decision']>();
  const candidateSelections = new Map<string, string>();
  const byKey = new Map(model.spells.map((spell) => [spell.logicalRefKey, spell]));
  const cancel = (): ResolverReviewOutcome => ({ action: 'cancel' });

  return {
    manualChoices: ['keep', 'overwrite', 'cancel'],
    decideManual(logicalRefKey, decision) {
      const spell = byKey.get(logicalRefKey);
      if (!spell?.manualConflict) throw new TypeError(`No manual conflict exists for ${logicalRefKey}.`);
      if (decision === 'cancel') {
        manualDecisions.clear();
        candidateSelections.clear();
        return;
      }
      if (decision === 'keep' && !spell.manualConflict.keepable) {
        throw new Error(`Current managed structure for ${logicalRefKey} cannot be kept.`);
      }
      manualDecisions.set(logicalRefKey, decision);
    },
    selectCandidate(logicalRefKey, selectedUuid) {
      const spell = byKey.get(logicalRefKey);
      if (!spell?.candidates.some((candidate) => candidate.uuid === selectedUuid)) {
        throw new TypeError(`Candidate ${selectedUuid} is not offered for ${logicalRefKey}.`);
      }
      candidateSelections.set(logicalRefKey, selectedUuid);
    },
    canApply() {
      return model.spells.every((spell) => {
        if (!spell.blocking) return true;
        if (spell.manualConflict && !manualDecisions.has(spell.logicalRefKey)) return false;
        if (requiresCandidateDecision(spell) && !candidateSelections.has(spell.logicalRefKey)) return false;
        return Boolean(spell.manualConflict || requiresCandidateDecision(spell));
      });
    },
    apply() {
      if (!this.canApply()) throw new Error('Every blocking review issue requires a decision before Apply.');
      return {
        action: 'apply',
        manualDecisions: [...manualDecisions].map(([logicalRefKey, decision]) => ({ logicalRefKey, decision }))
          .sort(compareLogicalKey),
        candidateSelections: [...candidateSelections].map(([logicalRefKey, selectedUuid]) => ({ logicalRefKey, selectedUuid }))
          .sort(compareLogicalKey),
      };
    },
    cancel,
    close: cancel,
  };
}

function requiresCandidateDecision(spell: ResolverReviewSpell): boolean {
  return spell.blocking && !spell.manualConflict && spell.candidates.length > 0;
}

export function renderResolverReviewHtml(model: ResolverReviewModel): string {
  const spells = model.spells.map((spell) => {
    const evidence = (spell.sourceEvidence ?? spell.evidence)
      .map((entry) => `${entry.start}–${entry.end}: ${entry.quote}`)
      .join('\n');
    const candidates = spell.candidates.map((candidate) => `
      <li class="fvtt-json-generator-spell-resolver-break">
        ${escape(candidate.packageId)} / ${escape(candidate.packId)} · ${escape(candidate.sourceBook ?? '—')} ·
        ${escape(candidate.rules ?? 'unknown')} · ${escape(String(candidate.level ?? '—'))} ·
        <code>${escape(candidate.uuid)}</code>
      </li>`).join('');
    const candidateSelect = requiresCandidateDecision(spell) ? `<label>Source
      <select data-logical-ref-key="${escapeAttribute(spell.logicalRefKey)}">
        <option value="">Select a concrete source</option>
        ${spell.candidates.map((candidate) => `<option value="${escapeAttribute(candidate.uuid)}">${escape(candidate.packageId)} / ${escape(candidate.packId)} / ${escape(candidate.rules ?? 'unknown')} / ${escape(candidate.uuid)}</option>`).join('')}
      </select></label>` : '';
    const keep = spell.manualConflict ? `
      <fieldset data-review-key="${escapeAttribute(spell.logicalRefKey)}">
        <legend>${escape(spell.manualConflict.explanation ?? 'Manual managed-content change')}</legend>
        <label><input type="radio" name="manual:${escapeAttribute(spell.logicalRefKey)}" value="keep"
          ${spell.manualConflict.keepable ? '' : 'disabled'}> Keep manual</label>
        <label><input type="radio" name="manual:${escapeAttribute(spell.logicalRefKey)}" value="overwrite"> Overwrite</label>
      </fieldset>` : '';
    return `<article class="fvtt-json-generator-spell-resolver-spell">
      <h3>${escape(spell.originalName)} <code>${escape(spell.refId)}</code></h3>
      <p class="fvtt-json-generator-spell-resolver-break">${escape(evidence)}</p>
      <ul>${candidates}</ul>
      ${candidateSelect}
      ${keep}
      <details><summary>Current / proposed diff</summary>
        <p>Last-generated proof (hash only; prior content unavailable)</p>
        <pre class="fvtt-json-generator-spell-resolver-scroll fvtt-json-generator-spell-resolver-break">${escape(pretty(spell.lastGeneratedProof))}</pre>
        <pre class="fvtt-json-generator-spell-resolver-scroll fvtt-json-generator-spell-resolver-break">${escape(pretty(spell.current))}</pre>
        <pre class="fvtt-json-generator-spell-resolver-scroll fvtt-json-generator-spell-resolver-break">${escape(pretty(spell.proposed))}</pre>
      </details>
      <ul>${spell.warnings.map((warning) => `<li>${escape(warning)}</li>`).join('')}</ul>
      <section><strong>literal-only</strong>${spell.literalRestrictions.map((restriction) =>
        `<p class="fvtt-json-generator-spell-resolver-break">${escape(restriction.kind)}: ${escape(restriction.text)}</p>`).join('')}</section>
    </article>`;
  }).join('');
  const findings = model.findings.map((entry) =>
    `<li class="fvtt-json-generator-spell-resolver-break"><code>${escape(entry.path)}</code> ${escape(entry.code)}: ${escape(entry.message)}</li>`).join('');
  return `<div class="fvtt-json-generator-spell-resolver-review">
    <section class="fvtt-json-generator-spell-resolver-scroll"><ul>${findings}</ul>${spells}</section>
  </div>`;
}

export interface ResolverDialogAdapter {
  renderTemplate(templatePath: string, context: Record<string, unknown>): Promise<string>;
  wait(config: Record<string, any>): Promise<unknown>;
}

export async function openResolverReviewDialog(
  model: ResolverReviewModel,
  adapter: ResolverDialogAdapter = defaultDialogAdapter(),
): Promise<ResolverReviewOutcome> {
  const session = createResolverReviewSession(model);
  const content = await adapter.renderTemplate(
    `modules/fvtt-json-generator-spell-resolver/templates/review.hbs`,
    { content: renderResolverReviewHtml(model) },
  );
  const config = {
    window: { title: model.title },
    position: { width: 760, height: 'auto' },
    content,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: 'apply', label: 'FVTTJSONSPELL.Action.Apply', icon: 'fa-solid fa-check', disabled: true,
        callback: (_event: unknown, button: any) => {
          readReviewForm(button?.form, session);
          return session.apply();
        },
      },
      { action: 'cancel', label: 'FVTTJSONSPELL.Action.Cancel', icon: 'fa-solid fa-xmark', type: 'button', disabled: false, callback: () => session.cancel() },
    ],
    render: (_event: unknown, dialog: any) => {
      const form = dialog?.element?.querySelector?.('form');
      const apply = dialog?.element?.querySelector?.('button[data-action="apply"]');
      const refresh = () => {
        try { readReviewForm(form, session); } catch { /* incomplete decisions remain disabled */ }
        if (apply) apply.disabled = !session.canApply();
      };
      form?.addEventListener?.('change', refresh);
      refresh();
    },
    close: () => session.close(),
  };
  const result = await adapter.wait(config);
  return isReviewOutcome(result) ? result : session.close();
}

function readReviewForm(form: any, session: ResolverReviewSession): void {
  if (!form?.querySelectorAll) return;
  for (const input of form.querySelectorAll('input[type="radio"]:checked')) {
    const name = String(input.name ?? '');
    if (name.startsWith('manual:')) session.decideManual(name.slice('manual:'.length), input.value);
  }
  for (const select of form.querySelectorAll('select[data-logical-ref-key]')) {
    if (select.value) session.selectCandidate(select.dataset.logicalRefKey, select.value);
  }
}

function defaultDialogAdapter(): ResolverDialogAdapter {
  const dialog = (globalThis as any).foundry?.applications?.api?.DialogV2;
  const renderTemplate = (globalThis as any).foundry?.applications?.handlebars?.renderTemplate;
  if (!dialog || typeof dialog.wait !== 'function') throw new Error('Foundry 14 DialogV2.wait is unavailable.');
  if (typeof renderTemplate !== 'function') throw new Error('Foundry 14 handlebars.renderTemplate is unavailable.');
  return {
    renderTemplate: (templatePath, context) => renderTemplate(templatePath, context),
    wait: (config) => dialog.wait(config),
  };
}

function isReviewOutcome(value: unknown): value is ResolverReviewOutcome {
  return typeof value === 'object' && value !== null && ((value as any).action === 'cancel' || (value as any).action === 'apply');
}

function compareLogicalKey(left: { logicalRefKey: string }, right: { logicalRefKey: string }): number {
  return left.logicalRefKey.localeCompare(right.logicalRefKey, 'en');
}

function pretty(value: unknown): string {
  return value === undefined ? '—' : JSON.stringify(value, null, 2);
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function escapeAttribute(value: string): string {
  return escape(value);
}
