# Polaris Fork Discussion Board

This file is the persistent discussion area for `aqiuya025/polaris-local-first`.

## Fork policy

- `main` stays close to upstream for future comparison and selective syncing.
- `ours` is the working branch for aqiuya-specific discussion, experiments, fixes, and later deployment work.
- Do not change product/runtime code before a problem, desired behavior, and acceptance test are written down here.
- Prefer small patches that remain understandable against upstream; avoid turning the fork into an unrelated rewrite.

## Current priority: OpenRouter Claude cache after MCP/tool history

### Observed behavior

Polaris + OpenRouter + Claude can cache normal conversation prefixes correctly. The reproducible problem appears after native MCP/tool use:

- Before MCP/tool history enters the conversation, cache reads can advance normally.
- After a model tool call and MCP tool result are added, later requests repeatedly write a large new cache region while reads remain stuck at the earlier pre-tool prefix.
- Adding a custom top-level `cache_control` body does not resolve the post-tool-history behavior.
- This is currently treated as a Polaris request-shaping/cache-frontier issue, not an Ombre Brain storage issue.

### Evidence from 2026-08-18 test

Normal cached request example:

- input: 21,591
- cache read: 21,105
- only a small remainder needed a new write

After MCP/tool use:

- input: about 48k–52k per request
- cache read remained around the earlier 21k–23k prefix
- cache write repeatedly grew by about 27k–29k

Earlier Opus 4.7 session showed the expensive extreme case:

- prompt/input tokens: about 1.28M
- cache read: 0
- cache write: about 1.22M
- total OpenRouter cost: about $8.20

The Opus session may contain an additional factor, so it should not yet be treated as fully explained by the MCP cache-frontier bug alone.

### Source areas already identified

Likely first inspection points:

- `src/engines/provider-runtime/providerRuntimeOpenAiCompatibleAdapter.ts`
  - OpenRouter Claude cache-control breakpoint selection
  - native assistant tool calls / tool-result history serialization
- `src/engines/request/requestCachePlan.ts`
- existing OpenAI-compatible provider runtime tests

Current source appears to place the rolling short-lived cache breakpoint on the latest ordinary conversation message, while native tool-history messages follow a separate path. The next code investigation should verify whether a completed `assistant tool_call -> tool_result -> continuation` exchange advances the cache frontier correctly.

### Rule before fixing

Before touching runtime code:

1. Add a focused failing regression test that contains normal dialogue followed by native tool call + tool result + continuation.
2. Confirm the expected request shape and cache-control location against OpenRouter/Anthropic behavior.
3. Make the smallest change that advances caching across completed tool history without breaking ordinary chat, images, or other OpenAI-compatible providers.
4. Verify with tests first; use Sonnet for paid live verification. Do not use Opus as the first test target.

## Direction under discussion: web-first Polaris

The fork may later be used primarily as a web/self-hosted client instead of relying on the original iOS App Store release.

Questions to decide before implementation:

- Which existing Polaris features are actually useful enough to keep?
- Which native-only functions can be ignored in a web-first build?
- Whether to deploy frontend and `/api` routes same-origin or split frontend/backend.
- How provider keys, relay routes, MCP connections, and local data should work in the browser.
- How to migrate useful data from the current iOS app into the web build without losing local-first ownership.
- Whether the fork should remain visually/product-compatible with upstream or gradually become an aqiuya-specific workspace.

## No-code status

As of this note, no runtime fix has been applied in the fork. The only fork-specific change is this discussion document on branch `ours`.
