# Phase 1 Live Cache Forensics

Status: **LIVE VALIDATION FAILED · UPSTREAM BODY CAPTURE INSTALLED**

## Paid live evidence

Real OpenRouter Claude Sonnet 4.6 + real Ombre Brain MCP was tested in the Web Escape Pod after the first native-tool cache-frontier patch.

Observed after the MCP exchange and on subsequent ordinary conversation turns:

```text
input  ≈ 72k
read   ≈ 23k
write  ≈ 49k
miss   ≈ 49k
cache  ≈ 31-32%
```

The critical fact is that `read` stayed around 23k while roughly the same 49k suffix was missed and written again on later normal turns.

Therefore the first patch was **necessary but not sufficient**. It proves Polaris can emit a cache marker on a completed native tool result, but real OpenRouter/Anthropic cache reuse still does not advance through the post-MCP conversation.

Do not describe Phase 1 as provider-live validated yet.

## Current high-probability hypothesis

Polaris deliberately orders stable system messages before conversation history and defers volatile system messages until after conversation history on the OpenAI-compatible request surface.

OpenRouter then converts Chat Completions into Anthropic Messages. Anthropic cache ordering is effectively:

```text
tools -> system -> messages
```

If OpenRouter gathers Polaris' deferred `role: system` messages back into Anthropic's `system` field, any per-request volatile system block can move **in front of the entire conversation history**. A timestamp, current work context, runtime feedback, or similar changing block would then invalidate the prefix after the stable ~23k region every turn.

This hypothesis matches the observed pattern but is not yet proven.

## Forensic instrumentation

OpenRouter's documented development-only debug option is now wired into `ours` behind this URL flag:

```text
?debugUpstream=1
```

When enabled for a streaming OpenRouter Claude request, Polaris adds:

```json
{
  "debug": {
    "echo_upstream_body": true
  }
}
```

OpenRouter returns the exact transformed upstream Anthropic request body in the first SSE chunk.

Implemented files:

- `src/engines/provider-runtime/openRouterUpstreamDebug.ts`
  - enables the debug request only for streaming `openrouter.ai` Claude routes;
  - extracts `debug.echo_upstream_body`;
  - stores the latest 8 captures locally;
  - fingerprints `tools`, `system`, and the combined pre-message prefix;
  - records every `cache_control` path in the transformed upstream body.
- `src/engines/chat-api/chatApiStreamingCollector.ts`
  - observes raw parsed stream chunks before normal provider event handling.
- `src/app/developer/openRouterUpstreamDebugOverlay.ts`
  - shows a local `UPSTREAM N` button only when `debugUpstream=1` is active;
  - compares the latest capture to the previous one and labels prefix/system/tools as `same` or `CHANGED`;
  - displays cache marker paths and raw transformed JSON;
  - can copy the latest upstream JSON locally.

The full transformed prompt may contain private conversation/MCP data. This instrumentation is intentionally opt-in and local-only and must not be used as a production default.

## Minimal next experiment

Use a **new conversation** and stop after the first post-MCP follow-up:

1. ordinary short message A;
2. ordinary short message B;
3. one `breath` / OB MCP call;
4. one short ordinary follow-up;
5. stop.

Inspect the `UPSTREAM` overlay across those captures.

Questions to answer directly from the transformed Anthropic request:

1. Does the MCP `tool_result` cache marker survive OpenRouter transformation?
2. Does Anthropic `system` change between ordinary turns?
3. Does Anthropic `tools` change between turns?
4. Does the combined `tools + system` prefix fingerprint remain stable?
5. Where exactly are the explicit `cache_control` markers after transformation?

No second paid follow-up is needed if the first already shows the failing prefix shape.
