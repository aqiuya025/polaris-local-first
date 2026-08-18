import { useEffect, useState } from 'react';
import { buildMcpHandle } from '../../../engines/mcpHandle';
import {
  beginMcpOAuthAuthorization,
  clearMcpOAuthAuthorization,
  hasStoredMcpOAuthAuthorization
} from '../../../engines/mcpOAuth';
import { resolveMcpToolCatalog, type McpResolvedToolDefinition } from '../../../engines/mcpRuntime';
import { useI18n } from '../../../i18n/useI18n';
import type { McpServerConfig, McpServerHeader, McpServerToolConfig, McpServerTransport } from '../../../types/domain';
import { Icon } from '../../Icon';

type McpServerEditorSheetProps = {
  open: boolean;
  server: McpServerConfig | null;
  timeoutSeconds: number;
  onClose: () => void;
  onSave: (patch: Omit<McpServerConfig, 'id' | 'handle'>) => void;
  onDelete?: () => void;
};

type McpConnectionTestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'success'; message: string }
  | { status: 'warning'; message: string }
  | { status: 'error'; message: string };

function createEmptyHeader(): McpServerHeader {
  return {
    id: `header-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    key: '',
    value: ''
  };
}

function mergeDiscoveredTools(
  currentTools: McpServerToolConfig[],
  discoveredTools: McpResolvedToolDefinition[]
): McpServerToolConfig[] {
  const currentByName = new Map(currentTools.map((tool) => [tool.name, tool] as const));
  return discoveredTools.map((tool) => {
    const current = currentByName.get(tool.toolName);
    return {
      name: tool.toolName,
      description: tool.description,
      inputSchema: tool.inputSchema,
      enabled: current?.enabled ?? tool.enabled ?? true
    };
  });
}

function parseOAuthRequirement(message: string) {
  const requiresOAuth = message.includes('需要 OAuth 授权') || /HTTP\s+401\b/.test(message);
  if (!requiresOAuth) return null;
  const explicitMatch = message.match(/资源元数据：(https?:\/\/[^\s·]+)/);
  if (explicitMatch?.[1]) return explicitMatch[1];
  const jsonMatch = message.match(/"resource_metadata"\s*:\s*"([^"]+)"/);
  return jsonMatch?.[1] ?? '';
}

export function McpServerEditorSheet({
  open,
  server,
  timeoutSeconds,
  onClose,
  onSave,
  onDelete
}: McpServerEditorSheetProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [transport, setTransport] = useState<McpServerTransport>('streamable-http');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<McpServerHeader[]>([]);
  const [tools, setTools] = useState<McpServerToolConfig[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [testState, setTestState] = useState<McpConnectionTestState>({ status: 'idle' });
  const [oauthResourceMetadataUrl, setOauthResourceMetadataUrl] = useState<string | null>(null);
  const [oauthConnected, setOauthConnected] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextUrl = server?.url ?? '';
    setName(server?.name ?? '');
    setDescription(server?.description ?? '');
    setTransport(server?.transport ?? 'streamable-http');
    setUrl(nextUrl);
    setHeaders(server?.headers.length ? server.headers : []);
    setTools(server?.tools ?? []);
    setIsActive(server?.isActive ?? true);
    setTestState({ status: 'idle' });
    setOauthResourceMetadataUrl(null);
    setOauthConnected(Boolean(nextUrl && hasStoredMcpOAuthAuthorization(nextUrl)));
    setOauthBusy(false);
  }, [open, server]);

  useEffect(() => {
    if (!open) return;
    setOauthConnected(Boolean(url.trim() && hasStoredMcpOAuthAuthorization(url.trim())));
  }, [open, url]);

  if (!open) return null;

  const normalizedHeaders = () =>
    headers
      .map((header) => ({
        ...header,
        key: header.key.trim(),
        value: header.value
      }))
      .filter((header) => header.key);

  const testConnection = async () => {
    const trimmedName = name.trim() || t('settings.mcp.testNameFallback');
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setTestState({ status: 'error', message: t('settings.mcp.testMissingUrl') });
      return;
    }

    const serverId = server?.id ?? 'mcp-test-preview';
    const draftServer: McpServerConfig = {
      id: serverId,
      handle: buildMcpHandle({
        handle: server?.handle,
        name: trimmedName,
        url: trimmedUrl,
        id: serverId
      }),
      name: trimmedName,
      description: description.trim(),
      transport,
      url: trimmedUrl,
      headers: normalizedHeaders(),
      tools,
      isActive: true
    };

    setTestState({ status: 'testing' });
    try {
      const result = await resolveMcpToolCatalog({
        servers: [draftServer],
        timeoutSeconds,
        retryDelaysMs: [],
        includeDisabledTools: true
      });
      if (result.errors.length) {
        const message = result.errors.join('\n');
        const oauthMetadataUrl = parseOAuthRequirement(message);
        if (oauthMetadataUrl !== null) {
          setOauthResourceMetadataUrl(oauthMetadataUrl || null);
          setOauthConnected(hasStoredMcpOAuthAuthorization(trimmedUrl));
          setTestState({
            status: 'warning',
            message: '这个 MCP 需要 OAuth 授权。点击下方“连接账户”完成登录后会自动重新测试。'
          });
          return;
        }
        setTestState({ status: 'error', message });
        return;
      }
      if (!result.tools.length) {
        setTestState({ status: 'warning', message: t('settings.mcp.testNoTools') });
        return;
      }

      setOauthResourceMetadataUrl(null);
      setOauthConnected(hasStoredMcpOAuthAuthorization(trimmedUrl));
      setTools((current) => mergeDiscoveredTools(current, result.tools));
      const toolNames = result.tools.map((tool) => tool.toolName).slice(0, 4).join(t('settings.mcp.testToolSeparator'));
      const summary = result.tools.length > 4
        ? t('settings.mcp.testToolSummaryMore', { count: result.tools.length })
        : t('settings.mcp.testToolSummary', { count: result.tools.length });
      setTestState({ status: 'success', message: t('settings.mcp.testSuccess', { summary, tools: toolNames }) });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.mcp.testFailed');
      const oauthMetadataUrl = parseOAuthRequirement(message);
      if (oauthMetadataUrl !== null) {
        setOauthResourceMetadataUrl(oauthMetadataUrl || null);
        setTestState({
          status: 'warning',
          message: '这个 MCP 需要 OAuth 授权。点击下方“连接账户”完成登录后会自动重新测试。'
        });
        return;
      }
      setTestState({ status: 'error', message });
    }
  };

  const authorizeOAuth = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setTestState({ status: 'error', message: t('settings.mcp.testMissingUrl') });
      return;
    }
    setOauthBusy(true);
    setTestState({ status: 'warning', message: '正在打开 MCP OAuth 登录页…' });
    try {
      await beginMcpOAuthAuthorization({
        serverUrl: trimmedUrl,
        serverName: name.trim() || undefined,
        resourceMetadataUrl: oauthResourceMetadataUrl
      });
      setOauthConnected(true);
      setOauthResourceMetadataUrl(null);
      setTestState({ status: 'success', message: 'OAuth 授权成功，正在重新读取 MCP 工具目录…' });
      await testConnection();
    } catch (error) {
      setTestState({
        status: 'error',
        message: error instanceof Error ? error.message : 'MCP OAuth 授权失败。'
      });
    } finally {
      setOauthBusy(false);
    }
  };

  const disconnectOAuth = () => {
    const trimmedUrl = url.trim();
    if (trimmedUrl) clearMcpOAuthAuthorization(trimmedUrl);
    setOauthConnected(false);
    setTestState({ status: 'warning', message: '已清除这个 MCP 在本浏览器中的 OAuth token。' });
  };

  const submit = () => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName) {
      window.alert(t('settings.mcp.nameRequired'));
      return;
    }
    if (!trimmedUrl) {
      window.alert(t('settings.mcp.urlRequired'));
      return;
    }

    onSave({
      name: trimmedName,
      description: description.trim(),
      transport,
      url: trimmedUrl,
      headers: normalizedHeaders(),
      tools,
      isActive
    });
    onClose();
  };

  return (
    <div className="mcp-inline-sheet-overlay" onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="mcp-inline-sheet mcp-inline-sheet--editor" role="dialog" aria-modal="true" aria-label={server ? t('settings.mcp.editorTitleEdit') : t('settings.mcp.editorTitleCreate')}>
        <div className="sheet-handle" />
        <div className="mcp-inline-sheet-header">
          <button type="button" className="mcp-icon-button" onClick={onClose} aria-label={t('settings.mcp.close')}>
            <Icon name="x" size={16} />
          </button>
          <strong>{server ? t('settings.mcp.editorTitleEdit') : t('settings.mcp.editorTitleCreate')}</strong>
          <button type="button" className="mcp-inline-sheet-confirm" onClick={submit}>
            {t('settings.mcp.save')}
          </button>
        </div>

        <div className="settings-form mcp-settings-form">
          <div className="memory-toggle memory-toggle--switch">
            <div className="memory-toggle-copy">
              <strong>{t('settings.mcp.enabledTitle')}</strong>
              <span>{t('settings.mcp.enabledDetail')}</span>
            </div>
            <button
              type="button"
              className={`ps-toggle-sw memory-toggle-switch ${isActive ? 'ps-toggle-sw--on' : ''}`}
              aria-pressed={isActive}
              onClick={() => setIsActive((value) => !value)}
            >
              <span className="ps-toggle-knob" />
            </button>
          </div>

          <label>
            {t('settings.mcp.nameLabel')}
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="My MCP" />
          </label>

          <label>
            {t('settings.mcp.descriptionLabel')}
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('settings.mcp.descriptionPlaceholder')}
            />
          </label>

          <div className="mcp-transport-field">
            <span>{t('settings.mcp.transportLabel')}</span>
            <div className="mcp-transport-switch">
              <button
                type="button"
                className={transport === 'streamable-http' ? 'active' : ''}
                onClick={() => setTransport('streamable-http')}
              >
                Streamable HTTP
              </button>
              <button
                type="button"
                className={transport === 'sse' ? 'active' : ''}
                onClick={() => setTransport('sse')}
              >
                SSE
              </button>
            </div>
          </div>

          <label>
            {t('settings.mcp.urlLabel')}
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="http://localhost:3000"
            />
          </label>

          <div className={`mcp-test-panel ${testState.status !== 'idle' ? `mcp-test-panel--${testState.status}` : ''}`}>
            <button
              type="button"
              className="mcp-btn secondary mcp-test-button"
              onClick={testConnection}
              disabled={testState.status === 'testing' || oauthBusy}
            >
              {testState.status === 'testing' ? t('settings.mcp.testing') : t('settings.mcp.testConnection')}
            </button>
            <p aria-live="polite">
              {testState.status === 'idle'
                ? t('settings.mcp.testIdle')
                : testState.status === 'testing'
                  ? t('settings.mcp.testReading')
                  : testState.message}
            </p>
            {oauthResourceMetadataUrl !== null || oauthConnected ? (
              <div className="mcp-inline-sheet-actions">
                <button
                  type="button"
                  className="mcp-btn primary"
                  onClick={authorizeOAuth}
                  disabled={oauthBusy || testState.status === 'testing'}
                >
                  {oauthBusy ? '授权中…' : oauthConnected ? '重新授权' : '连接账户'}
                </button>
                {oauthConnected ? (
                  <button type="button" className="mcp-btn secondary" onClick={disconnectOAuth} disabled={oauthBusy}>
                    断开 OAuth
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mcp-tool-editor">
            <div className="mcp-tool-editor-head">
              <div>
                <span>{t('settings.mcp.toolsSection')}</span>
                <strong>{t('settings.mcp.toolsCount', {
                  enabled: tools.filter((tool) => tool.enabled).length,
                  total: tools.length
                })}</strong>
              </div>
              <button
                type="button"
                className="theme-inline-action"
                onClick={testConnection}
                disabled={testState.status === 'testing' || oauthBusy}
              >
                {t('settings.mcp.refreshTools')}
              </button>
            </div>
            {tools.length > 0 ? (
              <div className="mcp-tool-list">
                {tools.map((tool) => (
                  <div key={tool.name} className={`mcp-tool-row ${tool.enabled ? '' : 'is-disabled'}`}>
                    <div className="mcp-tool-copy">
                      <strong>{tool.name}</strong>
                      <span>{tool.description || t('settings.mcp.toolNoDescription')}</span>
                    </div>
                    <button
                      type="button"
                      className={`ps-toggle-sw ${tool.enabled ? 'ps-toggle-sw--on' : ''}`}
                      aria-label={t('settings.mcp.toolToggleAria', {
                        name: tool.name,
                        status: tool.enabled ? t('settings.mcp.statusEnabled') : t('settings.mcp.statusDisabled')
                      })}
                      aria-pressed={tool.enabled}
                      onClick={() =>
                        setTools((current) =>
                          current.map((entry) =>
                            entry.name === tool.name ? { ...entry, enabled: !entry.enabled } : entry
                          )
                        )
                      }
                    >
                      <span className="ps-toggle-knob" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mcp-tool-empty">{t('settings.mcp.toolsEmpty')}</p>
            )}
          </div>

          <div className="mcp-header-editor">
            <div className="mcp-header-editor-head">
              <span>{t('settings.mcp.headersSection')}</span>
              <button
                type="button"
                className="theme-inline-action"
                onClick={() => setHeaders((current) => [...current, createEmptyHeader()])}
              >
                {t('settings.mcp.addHeader')}
              </button>
            </div>
            <div className="mcp-header-editor-list">
              {headers.map((header) => (
                <div key={header.id} className="mcp-header-row">
                  <input
                    value={header.key}
                    onChange={(event) =>
                      setHeaders((current) =>
                        current.map((entry) =>
                          entry.id === header.id ? { ...entry, key: event.target.value } : entry
                        )
                      )
                    }
                    placeholder="Header-Key"
                  />
                  <input
                    value={header.value}
                    onChange={(event) =>
                      setHeaders((current) =>
                        current.map((entry) =>
                          entry.id === header.id ? { ...entry, value: event.target.value } : entry
                        )
                      )
                    }
                    placeholder="Header Value"
                  />
                  <button
                    type="button"
                    className="mcp-icon-button subtle"
                    onClick={() => setHeaders((current) => current.filter((entry) => entry.id !== header.id))}
                    aria-label={t('settings.mcp.deleteHeader')}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mcp-inline-sheet-actions">
          {server && onDelete ? (
            <button type="button" className="mcp-btn danger" onClick={onDelete}>
              {t('settings.mcp.delete')}
            </button>
          ) : null}
          <button type="button" className="mcp-btn secondary" onClick={onClose}>
            {t('settings.mcp.cancel')}
          </button>
          <button type="button" className="mcp-btn primary" onClick={submit}>
            {t('settings.mcp.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
