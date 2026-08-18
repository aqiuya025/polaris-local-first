import { describe, expect, it } from 'vitest';
import type { McpServerConfig } from '../types/domain';
import { buildMcpProtectedResourceMetadataUrl } from './mcpOAuth';
import { clearMcpToolCatalogCacheForTests, resolveMcpToolCatalog } from './mcpRuntime';

function createServer(): McpServerConfig {
  return {
    id: 'mcp-oauth-test',
    handle: 'oauth_test',
    name: 'OAuth Test',
    description: '',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    headers: [],
    tools: [],
    isActive: true
  };
}

describe('MCP OAuth web support', () => {
  it('builds RFC 9728 protected-resource metadata URL for a path resource', () => {
    expect(buildMcpProtectedResourceMetadataUrl('https://example.com/mcp'))
      .toBe('https://example.com/.well-known/oauth-protected-resource/mcp');
    expect(buildMcpProtectedResourceMetadataUrl('https://example.com/team/mcp/'))
      .toBe('https://example.com/.well-known/oauth-protected-resource/team/mcp');
  });

  it('surfaces a 401 protected-resource challenge as an OAuth authorization requirement', async () => {
    clearMcpToolCatalogCacheForTests();
    const metadataUrl = 'https://example.com/.well-known/oauth-protected-resource/mcp';
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
      error: 'Unauthorized',
      resource_metadata: metadataUrl
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl}"`
      }
    });

    const result = await resolveMcpToolCatalog({
      servers: [createServer()],
      timeoutSeconds: 1,
      fetchImpl,
      retryDelaysMs: [],
      useCachedOnFailure: false,
      includeDisabledTools: true
    });

    expect(result.tools).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('需要 OAuth 授权');
    expect(result.errors[0]).toContain(metadataUrl);
  });
});
