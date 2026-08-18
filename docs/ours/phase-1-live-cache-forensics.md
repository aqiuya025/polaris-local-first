# Phase 1 Live Cache Forensics

Status: **LIVE VALIDATION FAILED · ROOT CAUSE NARROWED TO UPSTREAM PREFIX MUTATION**

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

## Clean forensic run

A new conversation was then run with OpenRouter `echo_upstream_body` enabled:

1. ordinary short turn A;
2. ordinary short turn B;
3. one real Ombre Brain `breath` call;
4. one ordinary post-tool follow-up;
5. stop.

Observed token accounting:

```text
ordinary baseline:
input ≈ 23k · read ≈ 23k · write ≈ 0.6-0.7k · cache ≈ 97-98%

tool continuation after the real MCP result:
input ≈ 43k · read 0 · write ≈ 43k · miss ≈ 43k · cache 0%

first ordinary turn after the tool exchange:
input ≈ 44k · read ≈ 23k · write ≈ 21k · miss ≈ 21k · cache ≈ 52%
```

This pins the failure boundary very tightly:

- ordinary conversation caching is healthy before MCP;
- asking the model to call the MCP is still healthy;
- the cache collapses on the **continuation request after the MCP result enters history**;
- the next ordinary turn recovers only the old ~23k stable prefix, not the newly written post-tool history.

The upstream-body overlay on that first ordinary post-tool turn reported:

```text
prefix CHANGED
system CHANGED · ~13.3k serialized chars
tools  CHANGED · ~26.9k serialized chars
cache markers: 2
  $.system[6].cache_control
  $.messages[8].content[0].cache_control
```

This is the strongest evidence so far. The transformed request reaching Anthropic does retain explicit cache markers, but both components that precede message history in Anthropic prompt-cache ordering — `tools` and `system` — changed between adjacent requests. Therefore a message-history cache written on the MCP continuation cannot be reused by the next ordinary request even when the message-side breakpoint itself is correct.

The current question is no longer “does the tool result get a cache marker?”; it is **which exact system block and/or tool definitions mutate across the tool continuation boundary, and why**.

## Current high-probability hypothesis

Polaris deliberately orders stable system messages before conversation history and defers volatile system messages until after conversation history on the OpenAI-compatible request surface.

OpenRouter then converts Chat Completions into Anthropic Messages. Anthropic cache ordering is effectively:

```text
tools -> system -> messages
```

If OpenRouter gathers Polaris' deferred `role: system` messages back into Anthropic's `system` field, any per-request volatile system block can move **in front of the entire conversation history**. A timestamp, current work context, runtime feedback, or similar changing block would then invalidate the prefix after the stable ~23k region every turn.

The live capture now proves the **upstream prefix really changes**. What remains to prove is which block(s) cause the system mutation and which tool entry/entries cause the tools mutation.

## Forensic instrumentation

OpenRouter's documented development-only debug option is wired into `ours` behind this URL flag:

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
  - now also explains the existing stored captures without another provider call by listing changed `system[index]` blocks and tool names that were added, removed, schema-changed, or merely reordered;
  - displays cache marker paths and raw transformed JSON;
  - can copy the latest upstream JSON locally.

The full transformed prompt may contain private conversation/MCP data. This instrumentation is intentionally opt-in and local-only and must not be used as a production default.

## Next step — no more paid calls yet

Do **not** run another Sonnet request yet.

The browser already holds the captured upstream bodies from the clean run. Pull the latest `ours` and refresh the same localhost origin. The upgraded overlay can diff those existing captures locally and should identify:

1. the exact changed Anthropic `system[index]` block(s), with short before/after previews;
2. tool names added, removed, schema-changed, or reordered;
3. cache-marker path changes.

Only after that local diff identifies the mutation should production code be changed and a single paid confirmation run be attempted.
