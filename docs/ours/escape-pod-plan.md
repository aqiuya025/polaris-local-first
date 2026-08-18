# Escape Pod Plan / 逃生舱计划

Status: **PHASE 0 SEALED · PHASE 1 CACHE PROVIDER-LIVE GREEN · WEB PRODUCT WORK NEXT**

This document defines the working roadmap for the aqiuya Polaris fork.

## Mission

Build a small, reliable, web-first Claude Chat fallback for personal use when the official Claude chat service is unavailable.

The fallback is not intended to replace Claude when the official product is usable. The goal is continuity, not platform ambition.

## Source references

### Polaris
Use Polaris as the primary implementation base for:

- provider/runtime abstraction
- OpenRouter and Anthropic routes
- prompt caching
- MCP/tool protocol
- attachments and files
- projects/workspace/artifact storage
- LocalData, import/export and backup
- web build and self-host path

### Chatnest
Use `ugui3u/chatnest` only as a behavioral and UI reference for:

- Claude-like chat layout
- mobile interaction
- Chats / Projects / Artifacts information architecture
- model picker
- recent chats navigation
- edit/retry/star/rename/delete interaction
- thinking/tool trace presentation
- compact sources presentation

Do not copy Chatnest implementation code into Polaris without a separate license review. Its published license is non-commercial only, while Polaris is AGPL-3.0-only.

## Product contract

The end product should feel like a small Claude-style chat client with these visible areas:

1. **Chats**
   - streaming chat
   - stop / retry / edit / fork
   - file and image upload
   - model and effort controls
   - conversation usage / cache health

2. **Projects**
   - project instructions
   - reference files
   - related chats
   - simple project navigation

3. **Artifacts / Workspace**
   - editable text/code artifacts
   - HTML/CSS/JS preview
   - project files

4. **Tools**
   - MCP connectors
   - Web Search / webpage read
   - only other tools that prove useful

5. **Settings**
   - provider/API configuration
   - model configuration
   - caching diagnostics
   - local backup/import/export
   - minimal appearance controls

## Explicit removals / hidden product areas

The fallback does not need:

- Polaris built-in memory
- cross-conversation semantic recall/vector memory
- generated conversation summaries
- proactive messages/scheduler
- group chat/member lanes/turn scheduler
- calendar/personal-data tools
- theme editing tools
- agent task/wait workflow unless a real use case later requires it
- public hosted free-model gateway/product ambitions

Voice, image generation, native desktop companion, iOS/Android wrappers and other extras are deferred until the web fallback is stable.

## P0 / Phase 1: API cost and prompt cache correctness

Prompt caching is a hard product requirement, not an optimization.

### Original failure

OpenRouter Claude requests cached normal conversation prefixes, but after native MCP/tool history the reusable cache frontier stalled before the tool exchange. Subsequent requests repeatedly rewrote the post-tool region instead of reading it from cache.

Observed historical patterns included:

- before MCP: roughly 21k-23k input with roughly the same cache read
- after MCP: cache read stayed near the old prefix while roughly 20k-49k post-tool suffix was repeatedly rewritten
- an earlier Opus 4.7 session produced roughly 1.28M prompt tokens, roughly 1.22M cache writes, zero cache reads and about $8.20 cost

### Root cause and fix

Provider-live forensics proved that Polaris Task bookkeeping mutated both Anthropic `tools` and `system` across the tool continuation boundary (`startTask` / `completeTask` plus task-ledger/work-runtime prompt changes). Since Anthropic cache ordering places tools and system before messages, that invalidated downstream conversation cache even when the tool result carried a valid cache marker.

The Escape Pod fix therefore has two parts:

- completed native tool results participate in the rolling conversation cache frontier;
- Task is release-gated off at request/product boundaries so it cannot mutate the pre-message prefix.

### Provider-live validation — GREEN

Final real OpenRouter Claude Sonnet 4.6 + real Ombre Brain validation showed the intended rolling behavior:

```text
first breath request:
read ≈ 21k · write ≈ 0.1k · cache ≈ 100%

continuation after breath result:
read ≈ 21k · write ≈ 20k

second breath request:
read ≈ 42k · write ≈ 0.1k · cache ≈ 100%

continuation after second breath result:
read ≈ 42k · write ≈ 20k

next ordinary turn:
read ≈ 62k · write ≈ 0.2k · cache ≈ 100%
```

The transformed upstream request simultaneously stayed stable at the pre-message prefix:

```text
prefix same
system same
tools same
```

This closes Phase 1: MCP result history is now written once and reused by later requests.

### Current TTL policy

The Escape Pod intentionally mixes TTLs:

- stable identity/capability prefix: **1 hour**;
- rolling conversation + native tool-result frontier: **5 minutes**.

This keeps the expensive stable tools/system prefix warm longer while avoiding the 1-hour write premium on every increment of a growing conversation.

### P0 acceptance contract

Current status:

- ordinary multi-turn chat advances cache reads — **PASS**
- one MCP tool call + result does not permanently stall the cache frontier — **PASS (provider-live)**
- repeated identical MCP exchanges remain cacheable — **PASS (provider-live)**
- large MCP results are not rewritten every later turn — **PASS (provider-live)**
- custom body workaround is not required — **PASS**
- file/attachment cache behavior — **later regression coverage**
- model/provider switches clearly rebuild cache — **later regression coverage**

### Cost observability target

Expose per-conversation/request health such as:

```text
Cache 82% · read 148k · write 31k · $0.18
```

Polaris already stores enough per-message/cache telemetry for the read/write/coverage portion, and the Escape Pod now renders compact per-assistant usage lines in chat. Cost estimation can be layered on later.

## Phase 0 architecture inventory — SEALED

See `docs/ours/phase-0-inventory.md`.

High-level rule:

- hide UI first;
- disable request/tool lanes next;
- delete dead code only after the simplified product runs reliably.

Do not physically delete central orchestration (`chatReplyRuntime`, `requestPreparation`, Persona internals, Collection/project storage) early.

## Web-first direction

The working architecture is:

```text
Browser / PWA
  ↓
Polaris Vite app
  ↓
Provider direct request when possible
  ↓ fallback only when necessary
small self-owned API/relay surface
```

Keep browser IndexedDB / LocalData as the primary store for the first web version.

Known backend-requiring paths include Web Search `/api/search`, provider relay fallback, and possibly a narrow MCP relay when a remote MCP endpoint cannot satisfy browser CORS.

MCP OAuth is implemented for Web and real Ombre Brain OAuth connectivity has already been exercised during the provider-live cache validation.

## Next product phase

With provider-live cache correctness green, move back to the planned Web product work:

1. keep Web Smoke green while slimming visible settings/tool groups;
2. progressively hide Memory / Group / Task / Theme / Calendar / Proactive product surfaces;
3. preserve Projects / Artifacts internals and simplify their UI;
4. move the shell toward the Claude-like Chats / Projects / Artifacts / Tools / Settings layout;
5. continue using the opt-in OpenRouter upstream forensic overlay as a regression aid while request-shape-affecting features are changed.
