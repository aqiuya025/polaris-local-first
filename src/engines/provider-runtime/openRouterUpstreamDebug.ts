import type { ProviderHttpRequest } from './providerRuntimeTypes';

export const OPENROUTER_UPSTREAM_DEBUG_EVENT = 'polaris:openrouter-upstream-debug-updated';
const STORAGE_KEY = 'polaris-openrouter-upstream-debug-v1';
const MAX_ENTRIES = 8;

type JsonRecord = Record<string, unknown>;

export type OpenRouterUpstreamDebugSummary = {
  provider: string;
  model: string;
  systemFingerprint: string;
  toolsFingerprint: string;
  prefixFingerprint: string;
  systemChars: number;
  toolsChars: number;
  messageCount: number;
  messageRoles: string[];
  cacheControlPaths: string[];
};

export type OpenRouterUpstreamDebugEntry = {
  at: number;
  body: JsonRecord;
  summary: OpenRouterUpstreamDebugSummary;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function hasQueryFlag(name: string) {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get(name) === '1';
  } catch {
    return false;
  }
}

export function isOpenRouterUpstreamDebugCaptureEnabled() {
  return hasQueryFlag('debugUpstream');
}

function isOpenRouterEndpoint(endpoint: string) {
  try {
    return new URL(endpoint).hostname.toLowerCase() === 'openrouter.ai';
  } catch {
    return false;
  }
}

function isAnthropicClaudeModel(model: unknown) {
  return typeof model === 'string'
    && model.toLowerCase().startsWith('anthropic/claude');
}

export function enableOpenRouterUpstreamDebug(
  request: ProviderHttpRequest,
  enabled = isOpenRouterUpstreamDebugCaptureEnabled()
): ProviderHttpRequest {
  if (!enabled) return request;
  if (!isOpenRouterEndpoint(request.endpoint)) return request;
  if (!isAnthropicClaudeModel(request.body.model)) return request;
  if (request.body.stream !== true) return request;

  const currentDebug = asRecord(request.body.debug) ?? {};
  return {
    ...request,
    body: {
      ...request.body,
      debug: {
        ...currentDebug,
        echo_upstream_body: true
      }
    }
  };
}

export function extractOpenRouterUpstreamBody(payload: unknown): JsonRecord | null {
  const root = asRecord(payload);
  const debug = asRecord(root?.debug);
  return asRecord(debug?.echo_upstream_body);
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
  return JSON.stringify(stableNormalize(value));
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

function serializedChars(value: unknown) {
  try {
    return JSON.stringify(value ?? null).length;
  } catch {
    return 0;
  }
}

function collectCacheControlPaths(value: unknown, path = '$', output: string[] = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectCacheControlPaths(entry, `${path}[${index}]`, output));
    return output;
  }
  const record = asRecord(value);
  if (!record) return output;
  if (record.cache_control !== undefined) output.push(`${path}.cache_control`);
  Object.entries(record).forEach(([key, entry]) => {
    if (key === 'cache_control') return;
    collectCacheControlPaths(entry, `${path}.${key}`, output);
  });
  return output;
}

export function summarizeOpenRouterUpstreamBody(body: JsonRecord): OpenRouterUpstreamDebugSummary {
  const system = body.system ?? null;
  const tools = body.tools ?? null;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const messageRoles = messages.map((message) => {
    const record = asRecord(message);
    return typeof record?.role === 'string' ? record.role : '?';
  });

  return {
    provider: typeof body.provider === 'string' ? body.provider : 'Anthropic',
    model: typeof body.model === 'string' ? body.model : '',
    systemFingerprint: fingerprint(system),
    toolsFingerprint: fingerprint(tools),
    prefixFingerprint: fingerprint({ tools, system }),
    systemChars: serializedChars(system),
    toolsChars: serializedChars(tools),
    messageCount: messages.length,
    messageRoles,
    cacheControlPaths: collectCacheControlPaths(body)
  };
}

function readStorage(): OpenRouterUpstreamDebugEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed as OpenRouterUpstreamDebugEntry[] : [];
  } catch {
    return [];
  }
}

function writeStorage(entries: OpenRouterUpstreamDebugEntry[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Debug capture must never break a chat request if browser storage is full.
  }
}

function broadcast() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPENROUTER_UPSTREAM_DEBUG_EVENT));
}

export function readOpenRouterUpstreamDebugEntries() {
  return readStorage();
}

export function clearOpenRouterUpstreamDebugEntries() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  broadcast();
}

export function captureOpenRouterUpstreamDebugPayload(payload: unknown) {
  if (!isOpenRouterUpstreamDebugCaptureEnabled()) return;
  const body = extractOpenRouterUpstreamBody(payload);
  if (!body) return;
  const entry: OpenRouterUpstreamDebugEntry = {
    at: Date.now(),
    body,
    summary: summarizeOpenRouterUpstreamBody(body)
  };
  const entries = [...readStorage(), entry].slice(-MAX_ENTRIES);
  writeStorage(entries);
  console.info('[polaris-openrouter-upstream]', entry.summary);
  broadcast();
}
