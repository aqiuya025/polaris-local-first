# Phase 1 Live Cache Forensics

Status: **PROVIDER-LIVE VALIDATED · PHASE 1 GREEN**

## Failure evidence before the final fix

Real OpenRouter Claude Sonnet 4.6 + real Ombre Brain MCP was tested in the Web Escape Pod after the first native-tool cache-frontier patch.

Observed after the MCP exchange and on subsequent ordinary conversation turns:

```text
input  ≈ 72k
read   ≈ 23k
write  ≈ 49k
miss   ≈ 49k
cache  ≈ 31-32%
```

The critical fact was that `read` stayed around the old stable prefix while roughly the same suffix was missed and written again.

The first cache-frontier patch was necessary but not sufficient: it correctly made completed native tool results eligible for the rolling message-side cache breakpoint, but Polaris task bookkeeping still changed the Anthropic prefix before message history.

## Clean forensic run that identified the root cause

A new conversation was run with OpenRouter `echo_upstream_body` enabled:

1. ordinary short turn A;
2. ordinary short turn B;
3. one real Ombre Brain `breath` call;
4. one ordinary post-tool follow-up;
5. stop.

Observed token accounting before the Task gate:

```text
ordinary baseline:
input ≈ 23k · read ≈ 23k · write ≈ 0.6-0.7k · cache ≈ 97-98%

tool continuation after the real MCP result:
input ≈ 43k · read 0 · write ≈ 43k · miss ≈ 43k · cache 0%

first ordinary turn after the tool exchange:
input ≈ 44k · read ≈ 23k · write ≈ 21k · miss ≈ 21k · cache ≈ 52%
```

Saved transformed Anthropic bodies then showed:

```text
system[4] CHANGED
system[5] CHANGED
system[6] CHANGED
system[7] CHANGED
system[8] ADDED

tools ADDED (1): startTask
tools REMOVED (1): completeTask
```

The important mutation was not Ombre Brain content. It was Polaris task state.

Because Anthropic prompt-cache ordering places `tools` and `system` before `messages`, changing either invalidated every downstream message-history cache prefix even though the MCP `tool_result` itself carried a valid `cache_control` marker.

## Root cause

**Polaris task bookkeeping changed both the Anthropic `tools` array and system capability/runtime blocks across a tool continuation boundary.**

The source matched the trace:

- task tools were enabled by default;
- task-tool visibility was state-dependent (`startTask` versus `completeTask`);
- tool evidence could promote task state during the same multi-request assistant turn;
- task state also changed task-ledger / work-runtime system prompt sections.

This was therefore a generic tool-continuation cache bug, not an Ombre Brain-specific problem.

## Implemented Escape Pod fixes

The Escape Pod keeps the first message-side cache-frontier patch and disables Task at product/request boundaries without deleting the upstream subsystem:

- `src/config/escapePodReleaseGates.ts`
  - declares `taskSubsystem: false`.
- `src/engines/tool-protocol/toolAvailability.ts`
  - refuses the `task` tool group even if old persisted preferences request it;
  - neither `startTask` nor `completeTask` can enter native tools.
- `src/engines/tool-protocol/toolPromptPreferences.ts`
  - defaults Task off.
- `src/stores/runtimeStoreToolbox.ts`
  - normalizes old task settings back to off on hydration.
- `src/engines/request/requestPromptLayers.ts`
  - strips legacy task-ledger state from model-facing prompts.
- `src/engines/request/escapePodTaskGate.test.ts`
  - locks the relevant task-gate contracts.

The implementation is intentionally a gate rather than a deletion so upstream rebases remain tractable.

## Final provider-live validation

After the Task gate and cache-frontier fixes, a clean OpenRouter Claude Sonnet 4.6 + real Ombre Brain run succeeded.

Observed sequence:

```text
first real breath request:
input ≈ 21k · read ≈ 21k · write ≈ 0.1k · cache ≈ 100%

continuation after first breath result:
input ≈ 42k · read ≈ 21k · write ≈ 20k · cache ≈ 52%

second identical breath request:
input ≈ 42k · read ≈ 42k · write ≈ 0.1k · cache ≈ 100%

continuation after second breath result:
input ≈ 62k · read ≈ 42k · write ≈ 20k · cache ≈ 67%

next ordinary user turn:
input ≈ 62k · read ≈ 62k · write ≈ 0.2k · cache ≈ 100%
```

The upstream forensics overlay simultaneously reported:

```text
prefix same
system same
tools same
```

Only the rolling message cache marker moved forward, which is the intended behavior.

This proves in a real paid provider run that:

- MCP tool results are cacheable;
- the reusable frontier advances across tool history;
- the large Ombre Brain result is written once and then read on later requests;
- task-state prefix churn has been removed from the Escape Pod request profile.

## TTL layout

The current Escape Pod intentionally uses mixed Anthropic TTLs:

- stable identity/capability prefix: **1 hour**;
- rolling conversation / native tool-result frontier: **5 minutes**.

In `providerRuntimeOpenAiCompatibleAdapter.ts`, the stable breakpoints inherit the request cache plan TTL (`1h`), while the latest conversation/tool-result breakpoint is explicitly emitted as default ephemeral caching (`5m`).

This keeps long-lived stable tools/system instructions warm for an hour without paying the 1-hour write premium on every newly growing conversation suffix.

During an active conversation, repeated 5-minute cache hits refresh the short-lived cache. If the user pauses beyond the short TTL, the stable 1-hour prefix can still hit while the conversation suffix is rebuilt.

## Forensic instrumentation

OpenRouter upstream capture remains available behind:

```text
?debugUpstream=1
```

It records transformed Anthropic bodies locally and compares tools, system, cache-marker paths, and message structure. It is opt-in/debug-only because captures can contain private conversation and MCP data.

## Phase 1 conclusion

**Phase 1 prompt-cache correctness is provider-live validated and may be treated as green.**

The forensic overlay can remain available during later Web/UI work as a regression aid, but no further cache surgery is required unless later features reintroduce prefix mutation.
