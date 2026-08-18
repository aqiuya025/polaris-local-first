// Browser OAuth 2.1 + PKCE support for remote HTTP MCP servers.
//
// This is intentionally independent from the MCP JSON-RPC transport. It owns
// protected-resource / authorization-server discovery, dynamic client
// registration, PKCE, the browser authorization popup, token persistence and
// refresh. The transport only asks this module for a Bearer header.

const TOKEN_STORAGE_PREFIX = 'polaris:mcp-oauth:token:v1:';
const CLIENT_STORAGE_PREFIX = 'polaris:mcp-oauth:client:v1:';
const OAUTH_CALLBACK_FILE = '/mcp-oauth-callback.html';
const TOKEN_EXPIRY_SKEW_MS = 30_000;

export type McpOAuthTokenRecord = {
  serverUrl: string;
  resource: string;
  authorizationServer: string;
  tokenEndpoint: string;
  clientId: string;
  redirectUri: string;
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  scope?: string;
  expiresAt?: number;
};

type McpOAuthClientRecord = {
  authorizationServer: string;
  registrationEndpoint: string;
  redirectUri: string;
  clientId: string;
};

type ProtectedResourceMetadata = {
  resource?: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
};

type AuthorizationServerMetadata = {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
};

type DynamicClientRegistrationResponse = {
  client_id?: string;
};

type OAuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number | string;
  scope?: string;
};

type OAuthCallbackPayload = {
  type: 'polaris:mcp-oauth-callback';
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
};

type FetchLike = typeof fetch;

function getLocalStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function normalizeServerUrl(serverUrl: string) {
  try {
    const url = new URL(serverUrl.trim());
    url.hash = '';
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    return url.toString();
  } catch {
    return serverUrl.trim();
  }
}

function storageKey(prefix: string, value: string) {
  return `${prefix}${encodeURIComponent(value)}`;
}

function readJson<T>(key: string): T | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  const storage = getLocalStorage();
  if (!storage) {
    throw new Error('当前浏览器无法保存 MCP OAuth 登录状态。');
  }
  storage.setItem(key, JSON.stringify(value));
}

function removeStored(key: string) {
  try {
    getLocalStorage()?.removeItem(key);
  } catch {
    // Ignore storage cleanup failures; callers can still re-authorize.
  }
}

function tokenKey(serverUrl: string) {
  return storageKey(TOKEN_STORAGE_PREFIX, normalizeServerUrl(serverUrl));
}

function clientKey(authorizationServer: string, redirectUri: string) {
  return storageKey(CLIENT_STORAGE_PREFIX, `${authorizationServer}|${redirectUri}`);
}

export function getStoredMcpOAuthToken(serverUrl: string): McpOAuthTokenRecord | null {
  const record = readJson<McpOAuthTokenRecord>(tokenKey(serverUrl));
  if (!record?.accessToken || !record.tokenEndpoint || !record.clientId || !record.resource) {
    return null;
  }
  return record;
}

export function hasStoredMcpOAuthAuthorization(serverUrl: string) {
  const record = getStoredMcpOAuthToken(serverUrl);
  return Boolean(record?.accessToken || record?.refreshToken);
}

export function clearMcpOAuthAuthorization(serverUrl: string) {
  removeStored(tokenKey(serverUrl));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function randomBase64Url(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Base64Url(value: string) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

function getFetch(fetchImpl?: FetchLike) {
  const resolved = fetchImpl ?? globalThis.fetch;
  if (!resolved) throw new Error('当前环境没有 fetch，无法完成 MCP OAuth。');
  return resolved;
}

async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label}失败：HTTP ${response.status}${text.trim() ? ` · ${text.trim()}` : ''}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label}返回了无法识别的 JSON。`);
  }
}

export function buildMcpProtectedResourceMetadataUrl(serverUrl: string) {
  const resource = new URL(serverUrl);
  const resourcePath = resource.pathname === '/'
    ? ''
    : resource.pathname.replace(/\/+$/, '');
  resource.pathname = `/.well-known/oauth-protected-resource${resourcePath}`;
  resource.search = '';
  resource.hash = '';
  return resource.toString();
}

function buildAuthorizationServerMetadataUrl(authorizationServer: string) {
  const issuer = new URL(authorizationServer);
  const issuerPath = issuer.pathname === '/'
    ? ''
    : issuer.pathname.replace(/\/+$/, '');
  issuer.pathname = `/.well-known/oauth-authorization-server${issuerPath}`;
  issuer.search = '';
  issuer.hash = '';
  return issuer.toString();
}

async function discoverProtectedResource(args: {
  serverUrl: string;
  resourceMetadataUrl?: string | null;
  fetchImpl?: FetchLike;
}) {
  const fetchImpl = getFetch(args.fetchImpl);
  const metadataUrl = args.resourceMetadataUrl?.trim()
    || buildMcpProtectedResourceMetadataUrl(args.serverUrl);
  const response = await fetchImpl(metadataUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  const metadata = await readJsonResponse<ProtectedResourceMetadata>(response, '读取 MCP OAuth 资源元数据');
  const authorizationServer = metadata.authorization_servers?.find((entry) => typeof entry === 'string' && entry.trim())?.trim();
  if (!authorizationServer) {
    throw new Error('MCP OAuth 资源元数据没有提供 authorization_servers。');
  }
  return {
    metadata,
    metadataUrl,
    authorizationServer,
    resource: metadata.resource?.trim() || normalizeServerUrl(args.serverUrl)
  };
}

async function discoverAuthorizationServer(authorizationServer: string, fetchImpl?: FetchLike) {
  const response = await getFetch(fetchImpl)(buildAuthorizationServerMetadataUrl(authorizationServer), {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  const metadata = await readJsonResponse<AuthorizationServerMetadata>(response, '读取 OAuth 授权服务器元数据');
  if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
    throw new Error('OAuth 授权服务器元数据缺少 authorization_endpoint 或 token_endpoint。');
  }
  if (metadata.code_challenge_methods_supported?.length
    && !metadata.code_challenge_methods_supported.includes('S256')) {
    throw new Error('这个 MCP OAuth 服务不支持 PKCE S256。');
  }
  return metadata;
}

async function resolveDynamicClient(args: {
  authorizationServer: string;
  registrationEndpoint: string;
  redirectUri: string;
  fetchImpl?: FetchLike;
}) {
  const key = clientKey(args.authorizationServer, args.redirectUri);
  const existing = readJson<McpOAuthClientRecord>(key);
  if (existing?.clientId
    && existing.authorizationServer === args.authorizationServer
    && existing.registrationEndpoint === args.registrationEndpoint
    && existing.redirectUri === args.redirectUri) {
    return existing.clientId;
  }

  const response = await getFetch(args.fetchImpl)(args.registrationEndpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_name: 'Polaris Escape Pod',
      redirect_uris: [args.redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    })
  });
  const registration = await readJsonResponse<DynamicClientRegistrationResponse>(response, '注册 MCP OAuth 客户端');
  const clientId = registration.client_id?.trim();
  if (!clientId) throw new Error('OAuth 动态注册没有返回 client_id。');
  writeJson(key, {
    authorizationServer: args.authorizationServer,
    registrationEndpoint: args.registrationEndpoint,
    redirectUri: args.redirectUri,
    clientId
  } satisfies McpOAuthClientRecord);
  return clientId;
}

function resolveScope(
  protectedMetadata: ProtectedResourceMetadata,
  authorizationMetadata: AuthorizationServerMetadata
) {
  const candidates = [
    ...(protectedMetadata.scopes_supported ?? []),
    ...(authorizationMetadata.scopes_supported ?? [])
  ].filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()));
  if (candidates.includes('mcp')) return 'mcp';
  return candidates[0]?.trim() || 'mcp';
}

function buildRedirectUri() {
  if (typeof window === 'undefined') {
    throw new Error('MCP OAuth 浏览器授权只能在 Web 界面中发起。');
  }
  return new URL(OAUTH_CALLBACK_FILE, window.location.origin).toString();
}

function openAuthorizationPopup() {
  if (typeof window === 'undefined') {
    throw new Error('当前环境无法打开 MCP OAuth 登录页。');
  }
  const popup = window.open('', 'polaris-mcp-oauth', 'popup,width=520,height=720');
  if (!popup) {
    throw new Error('浏览器拦截了 OAuth 登录窗口，请允许此站点打开弹窗后重试。');
  }
  try {
    popup.document.title = 'Polaris MCP OAuth';
    popup.document.body.textContent = '正在准备 MCP OAuth 登录…';
  } catch {
    // The blank popup is just a placeholder until discovery is complete.
  }
  return popup;
}

function waitForOAuthCallback(popup: Window, expectedState: string, timeoutMs = 5 * 60_000) {
  return new Promise<OAuthCallbackPayload>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      globalThis.clearInterval(closedTimer);
      globalThis.clearTimeout(timeoutTimer);
      window.removeEventListener('message', onMessage);
      callback();
    };
    const onMessage = (event: MessageEvent<OAuthCallbackPayload>) => {
      if (event.origin !== window.location.origin || event.source !== popup) return;
      const data = event.data;
      if (!data || data.type !== 'polaris:mcp-oauth-callback') return;
      finish(() => {
        if (data.state !== expectedState) {
          reject(new Error('MCP OAuth state 校验失败，请重新授权。'));
          return;
        }
        if (data.error) {
          reject(new Error(data.errorDescription || `MCP OAuth 授权失败：${data.error}`));
          return;
        }
        if (!data.code) {
          reject(new Error('MCP OAuth 回调没有返回 authorization code。'));
          return;
        }
        resolve(data);
      });
    };
    window.addEventListener('message', onMessage);
    const closedTimer = globalThis.setInterval(() => {
      if (!popup.closed) return;
      finish(() => reject(new Error('MCP OAuth 登录窗口已关闭。')));
    }, 500);
    const timeoutTimer = globalThis.setTimeout(() => {
      try { popup.close(); } catch { /* ignore */ }
      finish(() => reject(new Error('MCP OAuth 登录超时，请重试。')));
    }, timeoutMs);
  });
}

function resolveExpiresAt(expiresIn: OAuthTokenResponse['expires_in']) {
  const seconds = typeof expiresIn === 'number'
    ? expiresIn
    : typeof expiresIn === 'string'
      ? Number(expiresIn)
      : NaN;
  return Number.isFinite(seconds) && seconds > 0
    ? Date.now() + seconds * 1000
    : undefined;
}

function persistToken(args: {
  serverUrl: string;
  resource: string;
  authorizationServer: string;
  tokenEndpoint: string;
  clientId: string;
  redirectUri: string;
  response: OAuthTokenResponse;
  previous?: McpOAuthTokenRecord | null;
}) {
  const accessToken = args.response.access_token?.trim();
  if (!accessToken) throw new Error('OAuth token endpoint 没有返回 access_token。');
  const record: McpOAuthTokenRecord = {
    serverUrl: normalizeServerUrl(args.serverUrl),
    resource: args.resource,
    authorizationServer: args.authorizationServer,
    tokenEndpoint: args.tokenEndpoint,
    clientId: args.clientId,
    redirectUri: args.redirectUri,
    accessToken,
    refreshToken: args.response.refresh_token?.trim() || args.previous?.refreshToken,
    tokenType: args.response.token_type?.trim() || args.previous?.tokenType || 'Bearer',
    scope: args.response.scope?.trim() || args.previous?.scope,
    expiresAt: resolveExpiresAt(args.response.expires_in)
  };
  writeJson(tokenKey(args.serverUrl), record);
  return record;
}

async function exchangeAuthorizationCode(args: {
  serverUrl: string;
  resource: string;
  authorizationServer: string;
  tokenEndpoint: string;
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  fetchImpl?: FetchLike;
}) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    code_verifier: args.codeVerifier,
    resource: args.resource
  });
  const response = await getFetch(args.fetchImpl)(args.tokenEndpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });
  const token = await readJsonResponse<OAuthTokenResponse>(response, '交换 MCP OAuth token');
  return persistToken({ ...args, response: token });
}

export async function beginMcpOAuthAuthorization(args: {
  serverUrl: string;
  serverName?: string;
  resourceMetadataUrl?: string | null;
  fetchImpl?: FetchLike;
}) {
  const popup = openAuthorizationPopup();
  try {
    const protectedResource = await discoverProtectedResource(args);
    const authorizationMetadata = await discoverAuthorizationServer(
      protectedResource.authorizationServer,
      args.fetchImpl
    );
    const registrationEndpoint = authorizationMetadata.registration_endpoint?.trim();
    if (!registrationEndpoint) {
      throw new Error('这个 OAuth 授权服务器没有提供动态客户端注册端点。');
    }
    const redirectUri = buildRedirectUri();
    const clientId = await resolveDynamicClient({
      authorizationServer: protectedResource.authorizationServer,
      registrationEndpoint,
      redirectUri,
      fetchImpl: args.fetchImpl
    });
    const codeVerifier = randomBase64Url(32);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const state = randomBase64Url(24);
    const scope = resolveScope(protectedResource.metadata, authorizationMetadata);
    const authorizationUrl = new URL(authorizationMetadata.authorization_endpoint!);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('resource', protectedResource.resource);
    if (scope) authorizationUrl.searchParams.set('scope', scope);

    const callbackPromise = waitForOAuthCallback(popup, state);
    popup.location.replace(authorizationUrl.toString());
    const callback = await callbackPromise;
    try { popup.close(); } catch { /* ignore */ }

    return await exchangeAuthorizationCode({
      serverUrl: args.serverUrl,
      resource: protectedResource.resource,
      authorizationServer: protectedResource.authorizationServer,
      tokenEndpoint: authorizationMetadata.token_endpoint!,
      clientId,
      redirectUri,
      code: callback.code!,
      codeVerifier,
      fetchImpl: args.fetchImpl
    });
  } catch (error) {
    try { popup.close(); } catch { /* ignore */ }
    throw error;
  }
}

async function refreshStoredToken(
  record: McpOAuthTokenRecord,
  fetchImpl?: FetchLike
): Promise<McpOAuthTokenRecord | null> {
  if (!record.refreshToken) return null;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: record.refreshToken,
    client_id: record.clientId,
    resource: record.resource
  });
  const response = await getFetch(fetchImpl)(record.tokenEndpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });
  if (!response.ok) return null;
  const token = await response.json().catch(() => null) as OAuthTokenResponse | null;
  if (!token?.access_token) return null;
  return persistToken({
    serverUrl: record.serverUrl,
    resource: record.resource,
    authorizationServer: record.authorizationServer,
    tokenEndpoint: record.tokenEndpoint,
    clientId: record.clientId,
    redirectUri: record.redirectUri,
    response: token,
    previous: record
  });
}

export async function resolveMcpOAuthAuthorizationHeader(
  serverUrl: string,
  options?: { fetchImpl?: FetchLike; forceRefresh?: boolean }
) {
  let record = getStoredMcpOAuthToken(serverUrl);
  if (!record) return null;
  const expired = typeof record.expiresAt === 'number'
    && Date.now() + TOKEN_EXPIRY_SKEW_MS >= record.expiresAt;
  if ((options?.forceRefresh || expired) && record.refreshToken) {
    const refreshed = await refreshStoredToken(record, options?.fetchImpl).catch(() => null);
    if (refreshed) record = refreshed;
    else if (expired || options?.forceRefresh) {
      clearMcpOAuthAuthorization(serverUrl);
      return null;
    }
  } else if (expired) {
    clearMcpOAuthAuthorization(serverUrl);
    return null;
  }
  return `${record.tokenType || 'Bearer'} ${record.accessToken}`;
}
