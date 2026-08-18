# Escape Pod Plan / 逃生舱计划

Status: **PHASE 0 SEALED · PHASE 1 READY**

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

## P0: API cost and prompt cache correctness

Prompt caching is a hard product requirement, not an optimization.

### Known failure

OpenRouter Claude requests cache normal conversation prefixes, but after native MCP/tool history the short-lived cache frontier can remain stuck before the tool exchange. Subsequent requests repeatedly rewrite the post-tool region instead of reading it from cache.

Observed live test pattern:

- before MCP: roughly 21k input with roughly 21k cache read
- after MCP: roughly 48k-52k input; cache read stays near the old 21k-23k prefix; roughly 27k-29k is repeatedly written
- an earlier Opus 4.7 session produced roughly 1.28M prompt tokens, roughly 1.22M cache writes, zero cache reads and about $8.20 cost

### P0 acceptance contract

A runtime change must not be considered complete until all of these pass:

- ordinary multi-turn chat advances cache reads
- one MCP tool call + result does not permanently stall the cache frontier
- multiple MCP exchanges remain cacheable
- large MCP results do not force the same suffix to be rewritten every turn
- file/attachment interaction does not silently destroy stable-prefix caching
- switching model/provider clearly invalidates or rebuilds cache rather than producing misleading health metrics
- cache behavior remains correct with custom body empty; no user workaround should be required

### Cost observability target

Expose per-conversation/request health such as:

- input tokens
- cache read tokens
- cache write tokens
- cache hit ratio
- estimated/current cost when the provider exposes it

Future UI concept:

`Cache 82% · read 148k · write 31k · $0.18`

and a warning state when writes grow while reads stop advancing.

## Phase plan

### Phase 0 — Inventory only — **SEALED**

No runtime changes were made.

The implementation inventory, Cut Map, Web Map, migration/security observations and Phase-1 entry contract are frozen in:

- `docs/ours/phase-0-inventory.md`

Phase-0 conclusions:

- keep Polaris as the engine/runtime base;
- simplify/reframe Projects and Artifacts instead of rebuilding them;
- keep Persona/Collection internals while removing social/product framing;
- disable unwanted Memory/Task/Proactive/tool request lanes before deleting code;
- use the static Vite + explicit `/api` handler deployment path for web-first work;
- preserve IndexedDB LocalData and structured backup/import for the first web smoke build;
- treat complete backup ZIPs as credential-bearing secrets;
- enter runtime work through the cache regression suite, not UI cleanup.

### Phase 1 — Cache regression suite

Before fixing production code:

1. Add focused tests for ordinary conversation caching.
2. Add failing regression coverage for `assistant tool_call -> tool_result -> continuation`.
3. Add multi-tool and large-tool-result cases.
4. Confirm expected OpenRouter/Anthropic request shape.

### Phase 2 — Minimal cache fix

Make the smallest provider/runtime change needed to advance the cache frontier across completed native tool history.

Do not mix this patch with product UI cleanup.

Paid live verification uses Sonnet first. Opus is never the first test target.

### Phase 3 — Web-first smoke build

Produce a private self-hosted web build that can:

- open a chat
- configure/use provider routes
- upload files/images
- use MCP
- show cache health
- export/import local data

### Phase 4 — Product slimming

Hide or disable unwanted surfaces first. Remove dead code only after the retained Chat / Projects / Artifacts / Tools flows are stable.

### Phase 5 — Claude-style UI cleanup

Use Chatnest and current Claude interaction patterns as references while keeping Polaris internals.

Prioritize:

- simple left navigation
- clear recents
- compact model selector
- quiet thinking/tool trace row with expandable detail
- clean attachment composer
- Projects and Artifacts terminology
- cache/usage visibility without clutter

## Branch policy

- `main`: stay close to upstream
- `ours`: aqiuya working branch

Runtime changes should be small, test-backed and separately reviewable.

## Current active task

**Phase 1 — design and add the prompt-cache regression suite.**

The first runtime change must be a failing regression test for the native tool/MCP cache frontier. Production cache code is not to be modified until the failure is reproduced and the intended OpenRouter/Anthropic request shape is explicit.
