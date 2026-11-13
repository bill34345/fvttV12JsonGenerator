import type { ForgeProviderModelDiscoveryResult } from '@fvtt-json-generator/forge-browser-runtime/provider-connections';

export function mountForgeModelPicker(root: HTMLElement, discover: (signal: AbortSignal) => Promise<ForgeProviderModelDiscoveryResult>) {
  const field = root.querySelector<HTMLElement>('[data-model-field]');
  if (!field) return;
  const input = field.querySelector<HTMLInputElement>('[name="model"]')!;
  const toggle = field.querySelector<HTMLButtonElement>('[data-action="show-models"]')!;
  const clear = field.querySelector<HTMLButtonElement>('[data-action="clear-model"]')!;
  const refresh = field.querySelector<HTMLButtonElement>('[data-action="refresh-models"]')!;
  const panel = field.querySelector<HTMLElement>('[data-model-picker]')!;
  const list = field.querySelector<HTMLElement>('[data-model-options]')!;
  const status = field.querySelector<HTMLElement>('[data-model-status]')!;

  let result: ForgeProviderModelDiscoveryResult | undefined;
  let request: AbortController | undefined;
  let filterByInput = false;
  let active = -1;
  let options: string[] = [];

  function draw() {
    clear.disabled = input.disabled || !input.value;
    toggle.disabled = input.disabled;
    refresh.disabled = input.disabled || Boolean(request);
    input.setAttribute('aria-expanded', String(!panel.hidden));
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    input.removeAttribute('aria-activedescendant');
    const query = filterByInput ? input.value.trim().toLowerCase() : '';
    options = result?.models.filter(id => id.toLowerCase().includes(query)) ?? [];
    const message = request ? '正在读取模型列表…'
      : options.length ? (query ? '匹配 ' + options.length + ' 个模型' : result?.message)
        : result?.models.length ? '没有匹配的模型，可继续使用手填 ID。' : result?.message;
    status.textContent = message ?? '';
    list.replaceChildren(...options.map((id, index) => {
      const option = list.ownerDocument.createElement('li');
      option.id = list.id + '-' + index;
      option.setAttribute('role', 'option');
      option.dataset.modelIndex = String(index);
      option.setAttribute('aria-selected', String(id === input.value));
      option.textContent = id;
      return option;
    }));
  }

  function highlight(index: number) {
    if (index < 0 || index >= options.length) return;
    if (active >= 0) list.children[active]?.removeAttribute('data-active');
    active = index;
    const option = list.children[active] as HTMLElement;
    option.setAttribute('data-active', '');
    input.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView?.({ block: 'nearest' });
  }

  function close() {
    panel.hidden = true;
    active = -1;
    draw();
  }

  function reset() {
    request?.abort();
    request = undefined;
    result = undefined;
    filterByInput = false;
    close();
  }

  async function load() {
    if (request || input.disabled) return;
    const controller = new AbortController();
    request = controller;
    active = -1;
    result = undefined;
    draw();
    const deadline = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await discover(controller.signal);
      if (request === controller) result = response;
    } catch {
      if (request === controller) result = { status: 'browser_transport', models: [], message: '无法读取模型列表，可以直接输入模型 ID。' };
    } finally {
      clearTimeout(deadline);
      if (request === controller) {
        request = undefined;
        draw();
      }
    }
  }

  function open() {
    if (input.disabled) return;
    panel.hidden = false;
    active = -1;
    input.focus();
    draw();
    if (!result) void load();
  }

  function setModel(value: string) {
    input.value = value;
    input.dispatchEvent(new input.ownerDocument.defaultView!.Event('input', { bubbles: true }));
    filterByInput = false;
    close();
    input.focus();
  }

  toggle.onclick = () => panel.hidden ? open() : close();
  clear.onclick = () => setModel('');
  refresh.onclick = () => {
    input.focus();
    void load();
  };
  input.addEventListener('input', () => {
    filterByInput = true;
    active = -1;
    draw();
  });
  field.addEventListener('keydown', event => {
    if (panel.hidden && event.target !== input) return;
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      event.stopPropagation();
      close();
      input.focus();
    } else if (event.target === input && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      if (panel.hidden) open();
      if (!options.length) return;
      const index = event.key === 'ArrowDown' ? (active + 1) % options.length
        : active <= 0 ? options.length - 1 : active - 1;
      highlight(index);
    } else if (event.target === input && event.key === 'Enter' && !panel.hidden && active >= 0) {
      event.preventDefault();
      setModel(options[active]!);
    }
  });
  list.onmousedown = event => {
    if ((event.target as HTMLElement).closest('[data-model-index]')) event.preventDefault();
  };
  list.onclick = event => {
    const index = (event.target as HTMLElement).closest<HTMLElement>('[data-model-index]')?.dataset.modelIndex;
    if (index !== undefined) setModel(options[Number(index)]!);
  };
  field.addEventListener('focusout', event => {
    if (!field.contains(event.relatedTarget as Node | null)) close();
  });

  draw();
  return { draw, close, reset };
}
