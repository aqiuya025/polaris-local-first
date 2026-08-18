import { describe, expect, it } from 'vitest';
import type { ProviderHttpRequest } from './providerRuntimeTypes';
import {
  enableOpenRouterUpstreamDebug,
  extractOpenRouterUpstreamBody,
  normalizeOpenRouterUpstreamDebugEntry,
  summarizeOpenRouterUpstreamBody
} from './openRouterUpstreamDebug';

function createRequest(overrides?: Partial<ProviderHttpRequest>): ProviderHttpRequest {
  return {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    headers: { Authorization: 'Bearer test' },
    body: {
      model: 'anthropic/claude-sonnet-4.6',
      stream: true,
      messages: [{ role: 'user', content: 'hello' }]
    },
    provider: 'openai-completions',
    compatibilityMode: 'standard',
    ...overrides
  };
}

describe('OpenRouter upstream debug instrumentation', () => {
  it('adds echo_upstream_body only to streaming OpenRouter Claude requests', () => {
    const request = enableOpenRouterUpstreamDebug(createRequest(), true);
    expect(request.body.debug).toEqual({ echo_upstream_body: true });

    const nonStreaming = enableOpenRouterUpstreamDebug(createRequest({
      body: {
        model: 'anthropic/claude-sonnet-4.6',
        stream: false,
        messages: []
      }
    }), true);
    expect(nonStreaming.body).not.toHaveProperty('debug');

    const openAi = enableOpenRouterUpstreamDebug(createRequest({
      body: {
        model: 'openai/gpt-5-mini',
        stream: true,
        messages: []
      }
    }), true);
    expect(openAi.body).not.toHaveProperty('debug');
  });

  it('extracts and fingerprints the transformed Anthropic request body', () => {
    const upstreamBody = {
      model: 'claude-sonnet-4-6',
      system: [{ type: 'text', text: 'stable', cache_control: { type: 'ephemeral' } }],
      tools: [{ name: 'breath', description: 'memory tool' }],
      messages: [
        { role: 'user', content: 'hello' },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'memory', cache_control: { type: 'ephemeral' } }]
        }
      ]
    };
    const extracted = extractOpenRouterUpstreamBody({
      choices: [],
      debug: { echo_upstream_body: upstreamBody }
    });
    expect(extracted).toEqual(upstreamBody);

    const summary = summarizeOpenRouterUpstreamBody(upstreamBody);
    expect(summary.messageCount).toBe(2);
    expect(summary.messageRoles).toEqual(['user', 'user']);
    expect(summary.cacheControlPaths).toEqual([
      '$.system[0].cache_control',
      '$.messages[1].content[0].cache_control'
    ]);
    expect(summary.systemFingerprint).toHaveLength(8);
    expect(summary.toolsFingerprint).toHaveLength(8);
    expect(summary.prefixFingerprint).toHaveLength(8);
  });

  it('rebuilds a complete summary from a persisted legacy entry with a partial summary', () => {
    const legacy = {
      at: 123,
      body: {
        model: 'claude-sonnet-4-6',
        system: [{ type: 'text', text: 'stable' }],
        tools: [{ name: 'breath' }],
        messages: [{ role: 'user', content: 'hello' }]
      },
      summary: {
        model: 'claude-sonnet-4-6'
      }
    };

    const normalized = normalizeOpenRouterUpstreamDebugEntry(legacy);
    expect(normalized?.at).toBe(123);
    expect(normalized?.summary.messageRoles).toEqual(['user']);
    expect(normalized?.summary.cacheControlPaths).toEqual([]);
    expect(normalized?.summary.systemFingerprint).toHaveLength(8);
    expect(normalized?.summary.toolsFingerprint).toHaveLength(8);
  });
});
