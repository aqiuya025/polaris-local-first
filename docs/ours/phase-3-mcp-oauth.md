# Escape Pod · Phase 3 MCP OAuth

Status: **IMPLEMENTED · CI / LIVE VALIDATION PENDING**

## Why this became a Phase 3 blocker

The Web build can reach the real Ombre Brain MCP endpoint, but an unauthenticated `initialize` returns HTTP 401 with a protected-resource metadata URL:

```text
https://aqiuya.com/.well-known/oauth-protected-resource/mcp
```

This is useful evidence: the browser reaches the MCP service. The failure is authentication, not the prompt-cache fix and not a generic MCP transport failure.

The installed iOS Polaris is known to have completed this OAuth flow successfully in real use, including a browser login page and subsequent MCP calls. However, the current public Polaris source does **not** expose an MCP OAuth implementation in its editor/runtime path. The public editor only stores URL / headers / tools and calls the MCP catalog resolver; the public HTTP runtime previously treated 401 as a generic transport error.

Therefore the Escape Pod does not depend on reproducing an unpublished / binary-only implementation. Web OAuth is implemented directly against the MCP/OAuth standards.

## References used

### Polaris public source

- `src/ui/shell/menu/McpServerEditorSheet.tsx`: URL/header/test UI; no OAuth state machine in upstream public source.
- `src/engines/mcpRuntimeHttp.ts`: browser `fetch` / native `CapacitorHttp`; previously generic HTTP error handling.
- `ios/App/App/AppDelegate.swift`: generic Capacitor URL/deep-link forwarding exists, but no public MCP OAuth implementation was found.

### Ombre Brain

The deployed OB authentication model is OAuth 2.1 + PKCE and advertises the normal MCP discovery surface:

1. protected resource metadata
2. authorization server metadata
3. dynamic client registration
4. authorization code + PKCE S256
5. token exchange
6. Bearer token on `/mcp`
7. refresh-token grant

OB also supports static-token modes for clients that cannot do browser OAuth, but the Escape Pod should support normal remote-MCP OAuth instead of requiring a manual permanent header.

### RikkaHub

RikkaHub was used as a behavior/reference implementation, not copied source. Its public tree has dedicated `McpOAuthClient` and `McpOAuthCoordinator` components, confirming that treating OAuth as a separate MCP client concern is a sane architecture.

## Escape Pod implementation

### `src/engines/mcpOAuth.ts`

Owns:

- RFC 9728-style protected-resource metadata discovery
- authorization-server metadata discovery
- dynamic client registration for a public client
- PKCE S256 (`code_verifier` / `code_challenge`)
- `state` validation
- browser authorization popup
- authorization-code token exchange
- local browser token persistence
- refresh-token flow
- disconnect / re-authorize support

No client secret is stored or used.

### `public/mcp-oauth-callback.html`

Tiny same-origin callback bridge. It receives only OAuth callback parameters, posts them back to the opener, then closes. The access token is exchanged and stored by the main Polaris page, not placed in the callback URL.

### `src/engines/mcpRuntimeHttp.ts`

The MCP HTTP transport now:

- injects the stored OAuth Bearer token only when the user has **not** supplied an explicit `Authorization` header;
- refreshes once on a 401 when a refresh token is available;
- recognizes a 401 authorization challenge and preserves the protected-resource metadata URL instead of flattening everything into an opaque HTTP error.

Manual Authorization headers keep precedence so existing MCP configurations are not silently changed.

### `McpServerEditorSheet`

Connection testing now recognizes the 401 OAuth challenge and offers:

- **Connect account**
- **Re-authorize**
- **Disconnect OAuth**

After a successful browser authorization it automatically retries `initialize → tools/list`.

## Security constraints

- PKCE S256 is mandatory.
- `state` is generated with Web Crypto and verified on callback.
- Bearer tokens never go in URL query parameters.
- No OAuth client secret is used for this browser/public client.
- Existing explicit `Authorization` headers are never overwritten by automatic OAuth.
- Tokens are browser-local and keyed to the MCP server URL.
- Paid model calls are not needed to validate OAuth; validate the MCP catalog first.

## Validation contract

Before returning to paid Sonnet cache validation:

1. Web Smoke CI: typecheck + MCP OAuth regression + web build must be green.
2. Local Web → `https://aqiuya.com/mcp` connection test should surface **Connect account** instead of a raw 401.
3. OAuth popup should open OB login/authorization.
4. Callback should close the popup and store a Bearer token locally.
5. The automatic retry should load the real OB tool catalog.
6. Close/reopen the MCP editor: it should remain authorized without entering a manual header.
7. Only after that: run the paid Sonnet sequence and inspect per-request cache read/write telemetry.

## Scope note

This is the Web-first implementation required by the Escape Pod. The fact that the installed iOS binary already performs OAuth is treated as observed product behavior, not as a source dependency. If upstream later publishes its own OAuth path, compare behavior and merge only what is useful.
