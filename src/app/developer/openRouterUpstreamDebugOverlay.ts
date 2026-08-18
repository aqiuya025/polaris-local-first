import {
  clearOpenRouterUpstreamDebugEntries,
  isOpenRouterUpstreamDebugCaptureEnabled,
  OPENROUTER_UPSTREAM_DEBUG_EVENT,
  readOpenRouterUpstreamDebugEntries,
  type OpenRouterUpstreamDebugEntry
} from '../../engines/provider-runtime/openRouterUpstreamDebug';

function formatDelta(current: string, previous?: string) {
  if (!previous) return 'first';
  return current === previous ? 'same' : 'CHANGED';
}

function formatSummary(entry: OpenRouterUpstreamDebugEntry, previous?: OpenRouterUpstreamDebugEntry) {
  const summary = entry.summary;
  const previousSummary = previous?.summary;
  return [
    new Date(entry.at).toLocaleTimeString(),
    `model ${summary.model || '?'}`,
    `prefix ${summary.prefixFingerprint} ${formatDelta(summary.prefixFingerprint, previousSummary?.prefixFingerprint)}`,
    `system ${summary.systemFingerprint} ${formatDelta(summary.systemFingerprint, previousSummary?.systemFingerprint)} · ${summary.systemChars} chars`,
    `tools ${summary.toolsFingerprint} ${formatDelta(summary.toolsFingerprint, previousSummary?.toolsFingerprint)} · ${summary.toolsChars} chars`,
    `messages ${summary.messageCount} · ${summary.messageRoles.join(' → ')}`,
    `cache markers ${summary.cacheControlPaths.length}`,
    ...summary.cacheControlPaths.map((path) => `  ${path}`)
  ].join('\n');
}

function style(element: HTMLElement, declarations: Partial<CSSStyleDeclaration>) {
  Object.assign(element.style, declarations);
  return element;
}

export function installOpenRouterUpstreamDebugOverlay() {
  if (!isOpenRouterUpstreamDebugCaptureEnabled()) return;
  if (typeof document === 'undefined' || document.getElementById('polaris-upstream-debug-button')) return;

  const button = style(document.createElement('button'), {
    position: 'fixed',
    right: '14px',
    bottom: '14px',
    zIndex: '2147483646',
    border: '1px solid rgba(80,80,80,.25)',
    borderRadius: '999px',
    padding: '8px 12px',
    background: 'rgba(255,255,255,.94)',
    color: '#222',
    font: '12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace',
    boxShadow: '0 4px 18px rgba(0,0,0,.12)',
    cursor: 'pointer'
  });
  button.id = 'polaris-upstream-debug-button';

  const panel = style(document.createElement('div'), {
    position: 'fixed',
    right: '14px',
    bottom: '54px',
    zIndex: '2147483647',
    width: 'min(680px, calc(100vw - 28px))',
    maxHeight: '72vh',
    overflow: 'auto',
    display: 'none',
    border: '1px solid rgba(80,80,80,.2)',
    borderRadius: '14px',
    padding: '12px',
    background: 'rgba(250,250,250,.98)',
    color: '#171717',
    boxShadow: '0 12px 44px rgba(0,0,0,.2)',
    font: '12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace'
  });
  panel.id = 'polaris-upstream-debug-panel';

  const header = style(document.createElement('div'), {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '10px'
  });
  const title = document.createElement('strong');
  title.textContent = 'OpenRouter upstream forensics';
  title.style.marginRight = 'auto';

  const copyButton = document.createElement('button');
  copyButton.textContent = 'Copy latest JSON';
  const clearButton = document.createElement('button');
  clearButton.textContent = 'Clear';
  [copyButton, clearButton].forEach((control) => style(control, {
    border: '1px solid rgba(80,80,80,.2)',
    borderRadius: '8px',
    padding: '5px 8px',
    background: '#fff',
    cursor: 'pointer',
    font: 'inherit'
  }));
  header.append(title, copyButton, clearButton);

  const summary = style(document.createElement('pre'), {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    margin: '0',
    padding: '10px',
    borderRadius: '10px',
    background: 'rgba(0,0,0,.04)'
  });

  const details = document.createElement('details');
  details.style.marginTop = '10px';
  const detailsSummary = document.createElement('summary');
  detailsSummary.textContent = 'Raw latest upstream body';
  detailsSummary.style.cursor = 'pointer';
  const raw = style(document.createElement('pre'), {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    maxHeight: '44vh',
    overflow: 'auto',
    padding: '10px',
    background: 'rgba(0,0,0,.04)',
    borderRadius: '10px'
  });
  details.append(detailsSummary, raw);
  panel.append(header, summary, details);

  const render = () => {
    const entries = readOpenRouterUpstreamDebugEntries();
    button.textContent = `UPSTREAM ${entries.length}`;
    if (!entries.length) {
      summary.textContent = 'Waiting for OpenRouter debug chunk…';
      raw.textContent = '';
      return;
    }
    const latest = entries[entries.length - 1]!;
    const previous = entries.length > 1 ? entries[entries.length - 2] : undefined;
    summary.textContent = formatSummary(latest, previous);
    raw.textContent = JSON.stringify(latest.body, null, 2);
  };

  button.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    render();
  });
  copyButton.addEventListener('click', async () => {
    const entries = readOpenRouterUpstreamDebugEntries();
    const latest = entries[entries.length - 1];
    if (!latest) return;
    await navigator.clipboard?.writeText(JSON.stringify(latest.body, null, 2));
  });
  clearButton.addEventListener('click', () => {
    clearOpenRouterUpstreamDebugEntries();
    render();
  });
  window.addEventListener(OPENROUTER_UPSTREAM_DEBUG_EVENT, render);

  document.body.append(panel, button);
  render();
}
