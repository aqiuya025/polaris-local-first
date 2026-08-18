# Phase 1/2 Cache Fix Record

Status: **IMPLEMENTED · EXECUTION VALIDATION PENDING**

This note records the first runtime patch in the Escape Pod Plan.

## Problem reproduced in live Polaris usage

OpenRouter Claude prompt caching worked before native MCP/tool history entered the conversation, then the rolling cache frontier stopped advancing across the completed tool exchange.

Observed pattern:

- before MCP: roughly 21k input with roughly 21k cache read;
- after MCP: roughly 48k-52k input;
- cache read remained near the old 21k-23k frontier;
- roughly 27k-29k of post-tool context was repeatedly written;
- adding or removing a custom top-level body cache setting did not fix the behavior.

The expensive Opus 4.7 session was an extreme example: roughly 1.28M prompt tokens, roughly 1.22M cache writes, zero cache reads and about $8.20 usage.

## Source-level cause

`providerRuntimeOpenAiCompatibleAdapter.ts` selected the short-lived rolling breakpoint by scanning backwards for the latest non-empty textual `user` or `assistant` message in the `conversation` segment.

Completed native tool history is serialized as:

```text
assistant + tool_calls
tool + tool_result
```

The `tool` result was therefore not eligible for the rolling breakpoint. A tool-call-only assistant with empty visible text was also ineligible. Even when a cache index existed, the native tool branch rebuilt its payload instead of applying the cache-decorated content path.

Result: a large MCP result could remain permanently beyond the last reusable rolling breakpoint and be rewritten on subsequent requests.

## Implemented fix

Commit: `a7b384a7cf1aee4b36908ebe24bed606e4cbe44f`

The OpenAI-compatible adapter now:

1. computes the indexes of **completed native tool results** using the existing complete-tool-history detector;
2. allows a completed native `tool` result in the conversation segment to become the latest 5-minute rolling cache frontier;
3. applies the cache marker to that tool result's text content when it is the selected frontier;
4. leaves incomplete/orphan tool history unchanged;
5. leaves transcript fallback unchanged;
6. leaves ordinary OpenAI-compatible providers unchanged because this path is only active when `openAiCompatibleCacheControl` is enabled.

The native message shape remains a real tool message:

```text
role: tool
tool_call_id: ...
content: [
  {
    type: text,
    text: ...,
    cache_control: { type: ephemeral }
  }
]
```

## Regression suite

Dedicated file:

`src/engines/provider-runtime/providerRuntimeOpenAiCompatiblePromptCacheRegression.test.ts`

Current cases cover:

1. ordinary multi-turn rolling cache behavior;
2. completed tool result after an assistant tool call with empty visible text;
3. completed tool result taking priority over visible assistant text from the same tool-call turn;
4. multiple parallel tool results, with the frontier on the last completed result;
5. multiple sequential completed tool exchanges, with the frontier advancing to the latest one;
6. next normal user message reclaiming the rolling frontier after the tool exchange;
7. a large 32k tool result remaining eligible for the frontier;
8. scope guard: ordinary OpenAI-compatible tool results do not receive the OpenRouter-Claude cache marker.

Relevant test commits:

- `2ad48ca7f667db0441929a06b4716d6fe20d6038` — initial regression suite;
- `9547a817be23d96d52ca6e6e384540ac2ca0e735` — sequential/post-tool cases;
- `9a05c000278b9984defdfde5479a999eece57b47` — visible-assistant and provider-scope guards.

A focused GitHub Actions workflow exists at:

`.github/workflows/phase1-cache-regression.yml`

It runs the dedicated Vitest file when provider-runtime code changes on `ours`.

## Validation state

Do **not** mark the fix as fully validated yet.

The source shape and regression expectations have been reviewed, but the current ChatGPT GitHub connector does not expose the push-triggered workflow run/check result, and the local execution environment cannot clone/install this repository from GitHub.

Before Phase 2 is declared complete, obtain at least one actual test-run result and then perform a small paid live verification on the forked web build.

## Paid live validation contract

Use Sonnet first, with Custom Body empty.

Expected sequence:

1. ordinary conversation establishes cache reads;
2. invoke one MCP tool and receive a substantial tool result;
3. the first request after that exchange may write the new suffix;
4. subsequent requests should read the tool-result prefix instead of repeatedly rewriting the same large suffix;
5. cache read frontier should advance rather than remain permanently stuck before MCP;
6. only after Sonnet succeeds may an optional small Opus confirmation be attempted.

Opus is not a test runner.
