import type { ChatTokenUsage } from '../../../../types/domain';

function hasFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function formatTokenCount(value: number) {
  if (value < 1_000) return Math.round(value).toString();
  if (value < 1_000_000) {
    const digits = value < 10_000 ? 1 : 0;
    return `${(value / 1_000).toFixed(digits)}k`;
  }
  return `${(value / 1_000_000).toFixed(1)}m`;
}

function cacheReadRate(usage: ChatTokenUsage) {
  if (!hasFiniteNumber(usage.cachedInputTokens) || !hasFiniteNumber(usage.cacheMissInputTokens)) {
    return null;
  }
  const observed = usage.cachedInputTokens + usage.cacheMissInputTokens;
  if (observed <= 0) return null;
  return usage.cachedInputTokens / observed;
}

export function MessageUsageLine({ usage }: { usage?: ChatTokenUsage }) {
  if (!usage) return null;

  const items: Array<{ key: string; label: string; title: string; cache?: boolean }> = [];
  if (hasFiniteNumber(usage.inputTokens)) {
    items.push({ key: 'input', label: `in ${formatTokenCount(usage.inputTokens)}`, title: 'Input tokens' });
  }
  if (hasFiniteNumber(usage.cachedInputTokens)) {
    items.push({ key: 'read', label: `read ${formatTokenCount(usage.cachedInputTokens)}`, title: 'Prompt cache read', cache: true });
  }
  if (hasFiniteNumber(usage.cacheCreationInputTokens)) {
    items.push({ key: 'write', label: `write ${formatTokenCount(usage.cacheCreationInputTokens)}`, title: 'Prompt cache write', cache: true });
  }
  if (hasFiniteNumber(usage.cacheMissInputTokens)) {
    items.push({ key: 'miss', label: `miss ${formatTokenCount(usage.cacheMissInputTokens)}`, title: 'Prompt cache miss', cache: true });
  }
  if (hasFiniteNumber(usage.outputTokens)) {
    items.push({ key: 'output', label: `out ${formatTokenCount(usage.outputTokens)}`, title: 'Output tokens' });
  }

  const rate = cacheReadRate(usage);
  if (rate !== null) {
    items.push({
      key: 'rate',
      label: `cache ${Math.round(rate * 100)}%`,
      title: 'Cache read rate over reported cache read + miss tokens',
      cache: true
    });
  }

  if (items.length === 0 && hasFiniteNumber(usage.totalTokens)) {
    items.push({ key: 'total', label: `total ${formatTokenCount(usage.totalTokens)}`, title: 'Total tokens' });
  }
  if (items.length === 0) return null;

  return (
    <div className="message-usage-line" aria-label="Token and prompt-cache usage">
      {items.map((item) => (
        <span
          key={item.key}
          className={item.cache ? 'message-usage-line-item cache' : 'message-usage-line-item'}
          title={item.title}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}
