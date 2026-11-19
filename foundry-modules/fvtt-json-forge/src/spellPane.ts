
import { generateSpellArtifact, type SpellArtifact } from '@fvtt-json-generator/forge-browser-runtime/spell';
import { closeDocumentSourceEditor, renderDocumentSource } from './intakeReviewReader';
import { nativeProjectionForGame } from './nativeProjection';
import { assertExactRuntime, assertGm } from './runtime';
import type { ForgeItemGameLike } from './itemRuntime';
import { createVerifiedForgeSpell, type ForgeSpellDocument } from './spellRuntime';
import { renderForgeSpellPreview } from './spellPreview';
import type { ForgePaneState } from './workspacePane';
import { ItemIconEditor } from './itemIcon';

const EXAMPLE = `---
kind: spell
rules: 2024
name: 疗伤术 Cure Wounds
identifier: cure-wounds
source: SRD 5.2.1
level: 1
school: abj
activation: {type: action}
duration: {units: inst}
range: {units: touch}
components: [vocal, somatic]
target: {type: creature, count: 1}
activity:
  type: heal
  healing: {type: healing, dice: 2d8, bonus: '@mod', scaling: 2}
---
你触碰的一个生物恢复 2d8 加上你的施法属性调整值的生命值。

**使用更高环阶的法术位。** 法术位每比 1 环高一环，治疗量增加 2d8。
`;

export class ForgeSpellPane {
  private draft = '';
  private fileName = '';
  private revision = 0;
  private artifact?: SpellArtifact;
  private sheet = '';
  private previewOutdated = false;
  private readonly icon = new ItemIconEditor();
  private busy = false;
  private creating = false;
  private created?: ForgeSpellDocument;
  private status = '';
  private error = '';

  constructor(private readonly game: ForgeItemGameLike, private readonly foundry: unknown, private readonly changed: () => void) {}

  get stage(): ForgePaneState['stage'] {
    return this.created ? 'created' : this.artifact ? 'review' : 'input';
  }

  get locked(): boolean { return this.creating; }

  suspend(): void {
    this.previewOutdated = false;
    this.sheet = '';
    this.reset(this.draft);
  }

  dispose(): void {
    this.render = () => {};
    this.reset('');
  }

  mount(root: HTMLElement): void {
    const source = root.querySelector<HTMLTextAreaElement>('[data-spell-source]')!;
    const file = root.querySelector<HTMLInputElement>('[data-spell-file]')!;
    const generate = root.querySelector<HTMLButtonElement>('[data-spell-generate]')!;
    const example = root.querySelector<HTMLButtonElement>('[data-spell-example]')!;
    const create = root.querySelector<HTMLButtonElement>('[data-spell-create]')!;
    const open = root.querySelector<HTMLButtonElement>('[data-spell-open]')!;
    const status = root.querySelector<HTMLElement>('[data-spell-status]')!;
    const fileName = root.querySelector<HTMLElement>('[data-spell-file-name]')!;
    const error = root.querySelector<HTMLElement>('[data-spell-error]')!;
    const previewState = root.querySelector<HTMLElement>('[data-spell-preview-state]');
    const preview = root.querySelector<HTMLElement>('[data-spell-preview]')!;
    const output = root.querySelector<HTMLElement>('[data-spell-sheet]')!;
    const empty = root.querySelector<HTMLElement>('[data-spell-empty]')!;
    const iconPanel = root.querySelector<HTMLElement>('[data-spell-icon]');
    this.render = () => {
      if (source.value !== this.draft) source.value = this.draft;
      renderDocumentSource(root, this.draft);
      fileName.textContent = this.fileName;
      status.textContent = this.status;
      error.textContent = this.error;
      error.hidden = !this.error;
      preview.hidden = !this.sheet;
      empty.hidden = Boolean(this.sheet) || this.busy || Boolean(this.error);
      if (previewState) previewState.textContent = this.created ? '已创建'
        : this.previewOutdated ? '资料已改 · 预览待更新' : this.artifact ? '尚未创建' : '';
      this.icon.mountSelection(iconPanel, this.artifact ? {
        initialPath: this.artifact.item.img ?? 'systems/dnd5e/icons/svg/items/spell.svg',
      } : undefined, this.creating || Boolean(this.created), this.foundry, () => this.render());
      if (output.innerHTML !== this.sheet) output.innerHTML = this.sheet;
      generate.disabled = this.busy || this.creating || !this.draft.trim();
      create.disabled = !this.artifact || this.creating || Boolean(this.created) || this.icon.busy;
      create.hidden = Boolean(this.created);
      open.hidden = !this.created;
      source.disabled = file.disabled = example.disabled = this.creating;
      this.changed();
    };

    source.oninput = () => this.reset(source.value, Boolean(this.sheet));
    example.onclick = () => {
      this.fileName = '';
      closeDocumentSourceEditor(root);
      this.reset(EXAMPLE);
    };
    generate.onclick = async () => {
      await this.generate();
      if (this.artifact) closeDocumentSourceEditor(root);
    };
    file.onchange = async () => {
      const selected = file.files?.[0];
      if (!selected) return;
      file.value = '';
      this.reset(this.draft);
      const revision = this.revision;
      this.busy = true;
      this.status = '正在读取资料…';
      this.render();
      try {
        const content = await selected.text();
        if (revision !== this.revision) return;
        this.fileName = selected.name;
        closeDocumentSourceEditor(root);
        this.reset(content);
      } catch (cause) {
        if (revision === this.revision) {
          this.busy = false;
          this.showError(cause);
        }
      }
    };
    create.onclick = () => void this.create();
    open.onclick = () => {
      try { this.created?.sheet?.render(true); }
      catch (cause) { this.showError(cause); }
    };
    this.render();
  }

  private render = () => {};

  private reset(draft: string, keepPreview = false): void {
    this.draft = draft;
    this.revision++;
    this.artifact = undefined;
    if (!keepPreview) this.sheet = '';
    this.previewOutdated = keepPreview;
    this.icon.reset();
    this.busy = false;
    this.created = undefined;
    this.status = '';
    this.error = '';
    this.render();
  }

  private async generate(): Promise<void> {
    this.reset(this.draft);
    const revision = this.revision;
    this.busy = true;
    this.status = '正在准备预览…';
    this.render();
    try {
      assertGm(this.game);
      assertExactRuntime(this.game);
      const native = nativeProjectionForGame(this.game);
      if (!native) throw new Error('当前世界无法预览法术。刷新 Foundry 后再试。');
      const artifact = await generateSpellArtifact(this.draft, native);
      if (revision !== this.revision) return;
      const { verification } = artifact;
      const findings = verification.diagnostics.filter(entry => entry.path !== 'spell/gm').map(entry => entry.message).join('\n');
      if (verification.status === 'failed') throw new Error(findings);
      this.artifact = artifact;
      this.sheet = renderForgeSpellPreview(artifact);
      this.status = findings;
    } catch (cause) {
      if (revision === this.revision) this.showError(cause);
    } finally {
      if (revision === this.revision) {
        this.busy = false;
        this.render();
      }
    }
  }

  private async create(): Promise<void> {
    if (!this.artifact || this.creating || this.created || this.icon.busy) return;
    this.creating = true;
    this.error = '';
    this.status = '正在创建法术…';
    this.render();
    try {
      const result = await createVerifiedForgeSpell(this.game, this.artifact, this.icon.selection, this.foundry);
      this.created = result.item;
      this.status = result.status === 'existing' ? '这张法术卡已存在。' : '法术已创建。';
    } catch (cause) {
      this.showError(cause);
    } finally {
      this.creating = false;
      this.render();
    }
  }

  private showError(cause: unknown): void {
    this.status = '';
    this.error = cause instanceof Error ? cause.message : String(cause);
    this.render();
  }
}
