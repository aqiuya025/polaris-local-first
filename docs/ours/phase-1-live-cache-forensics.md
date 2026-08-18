# Phase 1 Live Cache Forensics

Status: **LIVE VALIDATION FAILED · ROOT CAUSE IDENTIFIED: TASK STATE MUTATES ANTHROPIC PREFIX**

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

The critical fact is that `read` stayed around 23k while roughly the same suffix was missed and written again on later normal turns.

Therefore the first patch was necessary but not sufficient. It correctly keeps a completed native tool result eligible for the rolling message-side cache frontier, but another prefix component was changing before message history.

## Clean forensic run

A new conversation was run with OpenRouter `echo_upstream_body` enabled:

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

This pins the failure boundary:

- ordinary conversation caching is healthy before MCP;
- the request that asks the model to call the MCP is still healthy;
- the cache collapses on the continuation request after the MCP result enters history;
- the next ordinary turn recovers only the old stable prefix, not the newly written post-tool history.

## Exact upstream diff

The saved OpenRouter-transformed Anthropic bodies were compared locally with no additional provider request.

Observed diff between the tool continuation and the next ordinary turn:

```text
system[4] CHANGED
system[5] CHANGED
system[6] CHANGED
system[7] CHANGED
system[8] ADDED

tools ADDED (1): startTask
tools REMOVED (1): completeTask

cache marker ADDED:
  $.system[6].cache_control
  $.messages[8].content[0].cache_control

cache marker REMOVED:
  $.system[5].cache_control
  $.messages[6].content[0].content[0].cache_control
```

The important mutation is not Ombre Brain content. It is Polaris task state.

The changed system blocks show the task capability/runtime prompt moving between:

- task-ledger capability instructions;
- active-task runtime prompt;
- ordinary markdown/tool capability prompt;
- current work-context projection.

At the same boundary, the Anthropic `tools` array changes from `completeTask` to `startTask`.

Because Anthropic prompt-cache ordering places `tools` and `system` before `messages`, changing either invalidates every downstream message-history cache prefix even when the `tool_result` itself carries a valid `cache_control` marker.

## Source confirmation

The source matches the live trace:

- `DEFAULT_POLARIS_TOOL_PROMPT_PREFERENCES.task` is currently `true`.
- Task-tool visibility is state-dependent: `startTask` and `completeTask` are mutually exposed according to task stage.
- `resolveConversationTaskMode()` and the conversation-task reducer promote task state to `active` when tool execution/evidence is recorded.
- Therefore a normal tool exchange can change the task-mode projection during the same multi-request assistant turn.

This means the cache problem is broader than Ombre Brain: any tool call capable of activating/updating the Polaris task ledger can mutate the pre-message Anthropic prefix.

## Root-cause statement

**The live cache failure is caused by Polaris task bookkeeping changing both the Anthropic `tools` array and system capability/runtime blocks across a tool continuation boundary.**

The earlier message-side cache-frontier patch remains correct and should stay. The remaining fix is to stop task bookkeeping from mutating the request prefix in the Escape Pod product profile.

For the Escape Pod, Task/Wait was already a planned cut/hide area, so the safest product-aligned fix is to disable the task subsystem at the request/profile boundary rather than trying to make `startTask`/`completeTask` mutations cache-compatible.

## Forensic instrumentation

OpenRouter upstream capture remains available behind:

```text
?debugUpstream=1
```

It records the transformed Anthropic body locally and compares:

- `tools`;
- `system`;
- cache marker paths;
- message roles/count.

The full transformed prompt may contain private conversation/MCP data. This instrumentation is opt-in and local-only.

## Next validation

Do not run another paid Sonnet test until the Escape Pod task subsystem is request-gated off.

After the gate is implemented and CI is green, repeat one minimal clean run:

1. ordinary short turn A;
2. ordinary short turn B;
3. one real OB `breath` call;
4. one short ordinary follow-up;
5. stop.

Expected result:

- `tools` fingerprint remains stable across the MCP continuation;
- task-related `system` blocks do not appear/change;
- the continuation may write the new post-tool prefix once;
- the following ordinary turn reads that expanded prefix instead of falling back to the old ~23k region.
