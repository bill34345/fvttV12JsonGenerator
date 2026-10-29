import type { HandbookEntry } from './types';

export type ModuleManual = Pick<HandbookEntry, 'title' | 'summary' | 'when' | 'requires' | 'steps' | 'outputs' | 'limits'>;

/** Render trusted catalog structure as inert text in a detached, owner-scoped article. */
export function renderModuleManual(document: Document, manual: ModuleManual): HTMLElement {
  const root = document.createElement('article');
  root.style.overflowY = 'auto';
  root.style.minHeight = '0';
  const text = (parent: HTMLElement, tag: string, value: string) => {
    const child = document.createElement(tag);
    child.textContent = value;
    parent.append(child);
    return child;
  };
  const list = (title: string, values: readonly string[]) => {
    text(root, 'h2', title);
    const ul = document.createElement('ul');
    for (const value of values) text(ul, 'li', value);
    root.append(ul);
  };
  text(root, 'h1', manual.title);
  text(root, 'p', manual.summary);
  text(root, 'p', manual.when);
  list('使用前准备', manual.requires);
  text(root, 'h2', '操作步骤');
  const steps = document.createElement('ol');
  for (const step of manual.steps) {
    const item = document.createElement('li');
    text(item, 'h3', step.title);
    text(item, 'p', step.text);
    if (step.command) text(text(item, 'pre', ''), 'code', step.command);
    steps.append(item);
  }
  root.append(steps);
  list('输出', manual.outputs);
  list('限制', manual.limits);
  return root;
}
