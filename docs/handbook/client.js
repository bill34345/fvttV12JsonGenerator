import { mountStandaloneHandbook } from './standalone';

const root = document.querySelector('[data-handbook-root]');
const content = document.getElementById('handbook-data');
if (root instanceof HTMLElement && content) {
  mountStandaloneHandbook(root, JSON.parse(content.textContent || 'null'), document.querySelector('meta[name="handbook-digest"]')?.getAttribute('content') || '');
}
