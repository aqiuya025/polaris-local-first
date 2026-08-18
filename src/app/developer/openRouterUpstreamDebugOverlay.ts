import {
  clearOpenRouterUpstreamDebugEntries,
  isOpenRouterUpstreamDebugCaptureEnabled,
  OPENROUTER_UPSTREAM_DEBUG_EVENT,
  readOpenRouterUpstreamDebugEntries,
  type OpenRouterUpstreamDebugEntry
} from '../../engines/provider-runtime/openRouterUpstreamDebug';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableNormalize);
  const record = asRecord(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, stableNormalize(record[key])])
  );
}

function stableStringify(value: unknown) {
  return JSON.stringify(stableNormalize(value)) ?? 'undefined';
}

function fingerprint(value: unknown) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

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

function compactText(value: unknown, maxChars = 120) {
  const text = typeof value === 'string'
    ? value
    : (() => {
        const record = asRecord(value);
        if (!record) return '';
        if (typeof record.text === 'string') return record.text;
        if (typeof record.content === 'string') return record.content;
        return '';
      })();
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '(non-text block)';
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars - 3)}...` : normalized;
}

function systemBlocks(body: JsonRecord) {
  if (Array.isArray(body.system)) return body.system;
  return body.system === undefined || body.system === null ? [] : [body.system];
}

function describeSystemChanges(currentBody: JsonRecord, previousBody: JsonRecord) {
  const current = systemBlocks(currentBody);
  const previous = systemBlocks(previousBody);
  const max = Math.max(current.length, previous.length);
  const lines: string[] = [];

  for (let index = 0; index < max; index += 1) {
    const currentBlock = current[index];
    const previousBlock = previous[index];
    if (previousBlock === undefined && currentBlock === undefined) continue;
    if (previousBlock === undefined) {
      lines.push(`system[${index}] ADDED · ${compactText(currentBlock)}`);
      continue;
    }
    if (currentBlock === undefined) {
      lines.push(`system[${index}] REMOVED · ${compactText(previousBlock)}`);
      continue;
    }
    if (fingerprint(currentBlock) === fingerprint(previousBlock)) continue;
    lines.push(`system[${index}] CHANGED`);
    lines.push(`  was: ${compactText(previousBlock)}`);
    lines.push(`  now: ${compactText(currentBlock)}`);
  }

  return lines;
}

function toolName(tool: unknown, index: number) {
  const record = asRecord(tool);
  if (typeof record?.name === 'string' && record.name.trim()) return record.name.trim();
  const fn = asRecord(record?.function);
  if (typeof fn?.name === 'string' && fn.name.trim()) return fn.name.trim();
  return `#${index}`;
}

function toolMap(body: JsonRecord) {
  const tools = Array.isArray(body.tools) ? body.tools : [];
  return new Map(tools.map((tool, index) => [toolName(tool, index), tool] as const));
}

function describeToolChanges(currentBody: JsonRecord, previousBody: JsonRecord) {
  const current = toolMap(currentBody);
  const previous = toolMap(previousBody);
  const names = Array.from(new Set([...previous.keys(), ...current.keys()])).sort((a, b) => a.localeCompare(b));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const name of names) {
    if (!previous.has(name)) {
      added.push(name);
      continue;
    }
    if (!current.has(name)) {
      removed.push(name);
      continue;
    }
    if (fingerprint(previous.get(name)) !== fingerprint(current.get(name))) {
      changed.push(name);
    }
  }

  const lines: string[] = [];
  if (added.length) lines.push(`tools ADDED (${added.length}): ${added.join(', ')}`);
  if (removed.length) lines.push(`tools REMOVED (${removed.length}): ${removed.join(', ')}`);
  if (changed.length) lines.push(`tools SCHEMA CHANGED (${changed.length}): ${changed.join(', ')}`);
  if (!lines.length && fingerprint(currentBody.tools) !== fingerprint(previousBody.tools)) {
    lines.push('tools ORDER CHANGED only (same named tool payloads)');
  }
  return lines;
}

function describeCacheMarkerChanges(entry: OpenRouterUpstreamDebugEntry, previous: OpenRouterUpstreamDebugEntry) {
  const current = new Set(entry.summary.cacheControlPaths ?? []);
  const prior = new Set(previous.summary.cacheControlPaths ?? []);
  const added = [...current].filter((path) => !prior.has(path));
  const removed = [...prior].filter((path) => !current.has(path));
  const lines: string[] = [];
  if (added.length) lines.push(`cache marker ADDED: ${added.join(', ')}`);
  if (removed.length) lines.push(`cache marker REMOVED: ${removed.join(', ')}`);
  return lines;
}

function formatBodyDiff(entry: OpenRouterUpstreamDebugEntry, previous?: OpenRouterUpstreamDebugEntry) {
  if (!previous) return 'Δ previous → latest\n(first upstream capture)';
  const lines = [
    'Δ previous → latest',
    ...describeSystemChanges(entry.body, previous.body),
    ...describeToolChanges(entry.body, previous.body),
    ...describeCacheMarkerChanges(entry, previous)
  ];
  if (lines.length === 1) lines.push('no system/tool/cache-marker changes');
  return lines.join('\n');
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
    width: 'min(760px, calc(100vw - 28px))',
    maxHeight: '76vh',
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

  const diff = style(document.createElement('pre'), {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    margin: '10px 0 0',
    padding: '10px',
    borderRadius: '10px',
    background: 'rgba(120,80,0,.06)'
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
  panel.append(header, summary, diff, details);

  const render = () => {
    try {
      const entries = readOpenRouterUpstreamDebugEntries();
      button.textContent = `UPSTREAM ${entries.length}`;
      if (!entries.length) {
        summary.textContent = 'Waiting for OpenRouter debug chunk…';
        diff.textContent = '';
        raw.textContent = '';
        return;
      }
      const latest = entries[entries.length - 1]!;
      const previous = entries.length > 1 ? entries[entries.length - 2] : undefined;
      summary.textContent = formatSummary(latest, previous);
      diff.textContent = formatBodyDiff(latest, previous);
      raw.textContent = JSON.stringify(latest.body, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diff.textContent = `forensics render error: ${message}`;
      console.warn('[polaris-openrouter-upstream] overlay render failed', error);
    }
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
