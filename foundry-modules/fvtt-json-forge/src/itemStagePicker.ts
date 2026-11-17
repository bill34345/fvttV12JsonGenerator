import { forgeItemStageOptions } from '@fvtt-json-generator/forge-browser-runtime';

const pickerSources = new WeakMap<HTMLSelectElement, { source: string; canonicalSource: string }>();

export function renderItemStagePicker(root: HTMLElement, source: string, canonicalSource = source): HTMLSelectElement | null {
  const select = root.querySelector<HTMLSelectElement>('select[name="itemStage"]');
  if (!select) return null;
  const prior = pickerSources.get(select);
  if (prior?.source !== source || prior.canonicalSource !== canonicalSource) {
    const stages = forgeItemStageOptions(source);
    if (select.parentElement) select.parentElement.hidden = stages.length === 0;
    const placeholder = select.ownerDocument.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '请选择阶段';
    const options = stages.map((name, index) => {
      const option = select.ownerDocument.createElement('option');
      option.value = String(index);
      option.textContent = name;
      return option;
    });
    select.replaceChildren(placeholder, ...options);
    pickerSources.set(select, { source, canonicalSource });
    const selected = /^(?:\uFEFF)?---[^\S\r\n]*\r?\n(?:(?!---)[^\r\n]*\r?\n)*?forge-item-stage: (\d+)\r?$/mu.exec(canonicalSource);
    if (selected && Number(selected[1]) <= stages.length) select.value = String(Number(selected[1]) - 1);
  }
  return select;
}

export function selectedItemStage(root: HTMLElement): number | undefined {
  const value = root.querySelector<HTMLSelectElement>('select[name="itemStage"]')?.value;
  return value ? Number(value) : undefined;
}
