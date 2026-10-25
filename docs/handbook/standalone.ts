import { mountHandbook, type HandbookContent, type HandbookHandle, type HandbookTheme } from '@fvtt-json-generator/suite-handbook';

/** The offline HTML owns browser globals; the shared reader owns only its root. */
export function mountStandaloneHandbook(root: HTMLElement, content: HandbookContent, contentDigest = ''): HandbookHandle {
  const document = root.ownerDocument;
  const window = document.defaultView;
  if (!window) throw new TypeError('Standalone handbook needs a browser window');
  let theme: HandbookTheme = 'light';
  try {
    const saved = window.localStorage.getItem('handbook-theme');
    theme = saved === 'dark' || saved === 'light' ? saved
      : window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch { /* file-origin storage may be unavailable; reading still works. */ }
  document.documentElement.dataset.theme = theme;
  let renderedHash = window.location.hash;
  return mountHandbook(root, content, {
    initialRoute: window.location.hash,
    initialTheme: theme,
    idPrefix: '',
    contentDigest,
    href: route => '#' + route,
    onNavigate(route, { replace }) {
      const hash = '#' + route;
      if (window.location.hash === hash) return;
      // Native fragment navigation also works when file-origin History API
      // writes are unavailable. Rendering already happened in the reader.
      if (replace) window.location.replace(hash);
      else window.location.hash = hash;
      renderedHash = window.location.hash;
    },
    onTitleChange(title) { document.title = title; },
    onThemeChange(next) {
      document.documentElement.dataset.theme = next;
      try { window.localStorage.setItem('handbook-theme', next); } catch { /* optional persistence */ }
    },
    copyText(text) {
      const clipboard = window.navigator.clipboard;
      if (!clipboard?.writeText) throw new Error('clipboard unavailable');
      return clipboard.writeText(text);
    },
    scrollToTop() { window.scrollTo(0, 0); },
    subscribeRoute(navigate) {
      const changed = (): void => {
        const hash = window.location.hash;
        if (hash === renderedHash) return;
        renderedHash = hash;
        navigate(hash);
      };
      window.addEventListener('hashchange', changed);
      return () => window.removeEventListener('hashchange', changed);
    },
    subscribeShortcuts(keydown) {
      const globalKeydown = (event: KeyboardEvent): void => {
        if (!root.contains(event.target as Node)) keydown(event);
      };
      document.addEventListener('keydown', globalKeydown);
      return () => document.removeEventListener('keydown', globalKeydown);
    },
  });
}
