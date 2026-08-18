# Phase 0 Inventory / 第一阶段封板

Status: **SEALED**

Scope: read-only architecture inventory. No product/runtime source code was changed in Phase 0.

This document records the implementation map, cut map, web map, security observations, and the entry criteria for Phase 1 of the Escape Pod Plan.

## Executive conclusion

Do **not** rewrite Polaris into a new chat client.

The escape pod should keep the Polaris engine room and replace/simplify the product shell:

- Polaris remains the implementation base for chat lifecycle, providers, prompt construction, prompt caching, MCP, attachments, Projects/Workspace, Artifacts/preview, LocalData, usage telemetry, import/export and backup.
- `ugui3u/chatnest` remains a behavioral/UI reference for a Claude-like chat surface only. Its implementation should not be copied into this AGPL fork without a separate license review.
- The target product is intentionally small: **Chats / Projects / Artifacts / Tools / Settings**.
- Polaris memory, group chat, proactive behavior, social/persona product framing and unrelated agent/platform ambitions should be hidden or gated before any physical code deletion.
- Prompt-cache correctness is the first runtime change. Product slimming and UI redesign must not be mixed into the cache fix.

In short: **keep the engine, remove unnecessary cabins, replace the cockpit.**

## Retained architecture map

| Area | Decision | Coupling risk | Phase-0 conclusion |
| --- | --- | --- | --- |
| Chat lifecycle | **KEEP** | High | Submit/stop/retry/edit/fork/streaming/tool continuation already exist. Redesign UI, do not rewrite the workflow engine. |
| Provider/runtime adapters | **KEEP** | High | Anthropic/OpenRouter/OpenAI-compatible routing and capability logic are core escape-pod infrastructure. |
| Prompt caching | **KEEP / P0** | High | Economic viability requirement. Must be test-backed across native tool/MCP history. |
| MCP runtime | **KEEP / P0** | Medium-low | Catalog, transport, invocation and attachments are already separated cleanly. Ombre Brain remains an external MCP service. |
| Attachments/files/images | **KEEP** | Medium-low | Existing ingestion handles images, PDF, DOCX, XLSX/CSV, ZIP, text and code files. |
| Web search / webpage read | **KEEP** | Medium | Useful Claude-style capability, but it depends on a backend `/api/search` route. |
| Projects / Workspace | **KEEP / SIMPLIFY** | Medium-high | Existing project files, reference docs, project chats and preview engine are valuable. Rename/reframe rather than rebuild. |
| Artifacts / code cards / preview | **KEEP / SIMPLIFY** | Medium-high | Reuse editor/preview/runtime diagnostics; simplify product vocabulary and navigation. |
| Persona / collaborator data model | **KEEP INTERNAL / SIMPLIFY UI** | High | Chat, ownership and project/card attribution depend on it. Keep it as hidden assistant/profile configuration instead of a social product. |
| Collection store | **KEEP INTERNAL / REFRAME UI** | High | It is the storage engine behind Projects/Artifacts. The current “room world” presentation can be replaced. |
| Usage/cache telemetry | **KEEP / ELEVATE** | Medium | Existing telemetry already records cache read/write/miss and request fingerprints; surface a compact health indicator in chat. |
| Import/export/backup | **KEEP** | High | Critical escape hatch and iOS-to-web migration path. |
| Polaris memory system | **HIDE/GATE, LATER CLEAN** | Very high | Memory is integrated into request preparation. Disable request lanes/tools/UI first; do not delete central request code. |
| Group chat | **HIDE, LATER CLEAN** | Medium | Separate world/navigation entry makes UI hiding easy; implementation can remain dormant initially. |
| Task / proactive behavior | **HIDE/GATE, LATER CLEAN** | High | Task continuation is threaded through chat runtime. Disable exposure/defaults first, do not rip it from orchestration in the cache phase. |
| Theme-editing tools | **HIDE/CUT** | Medium | Keep ordinary light/dark appearance; remove model-driven CSS/tool exposure from the escape-pod product. |
| Calendar/personal-data tools | **HIDE/CUT** | Low-medium | Not needed in the fallback; external MCP can provide such capabilities later. |
| Voice/image generation/desktop companion | **DEFER** | Variable | No work until core web fallback is stable. |
| Native iOS/Android wrappers | **DEFER** | High maintenance | Web-first avoids maintaining a separate signing/release channel. |

## Cut Map

The first slimming pass should distinguish **hiding**, **request gating**, and **physical deletion**. Mixing them is the fastest way to break unrelated chat behavior.

### A. Safe first-pass UI hiding

These surfaces can be removed from the escape-pod navigation before deleting their implementation:

- Group world and group navigation entry.
- Polaris Memory settings and memory evidence UI.
- Automation/proactive settings.
- Calendar/personal-data UI.
- Model-driven theme-editing controls.
- Product-knowledge helper UI.
- Public/free gateway product surfaces that are irrelevant to a personal fallback.
- Voice, image-generation and desktop-companion settings while those features are deferred.
- Collaborator/social framing that is not needed for a single-assistant Claude-style client.

Settings are already split into independent pages, and Group is rendered as a separate world frame, so the UI can be simplified without first deleting the underlying stores/executors.

### B. Runtime/request gates that must actually stop work

Hiding a button is not enough if the request compiler still injects context or exposes tools.

Before calling the product “slimmed”, verify all of the following:

- conversation-summary request lane disabled;
- vector/semantic cross-conversation recall disabled;
- Polaris `memory`, `memoryRecall`, and `memoryWrite` tool groups disabled and absent from model-visible tools;
- proactive tools disabled;
- task mode/tools disabled by default and hidden from the normal chat surface;
- personal-data, theme, generation, desktop, product-knowledge/environment helper tool groups disabled unless a concrete retained use case requires them;
- no background summary/embedding work remains enabled for removed memory features;
- ordinary chat prompt receipts contain no Polaris-memory payload when the escape-pod profile is active.

A future centralized “escape pod feature profile” may be cleaner than scattered flags, but that belongs to the product-slimming phase, not the P0 cache patch.

### C. Red zones — do not physically delete early

Keep these implementation areas intact through the cache and first web-smoke phases:

- `src/app/chat/chatReplyRuntime.ts`
- `src/engines/request/requestPreparation.ts`
- request context/compiler and provider runtime adapters
- Persona store/types and collaborator ownership fields
- Collection store, RoomProject, ProjectFile and WorkspaceReferenceDoc structures
- tool registry/executor/plugin infrastructure
- Task implementation, even while its user-facing feature is disabled
- Memory implementation, after its request lanes are disabled
- Group implementation, after its navigation is hidden
- LocalData/import/export/asset persistence

The objective is to make unwanted systems **dormant before making them dead**.

## Web Map

### Frontend

The concrete web path is already a normal Vite build:

```text
npm run build -> dist/
```

The static frontend can be hosted on any static host. Same-origin or split `/api` deployment is supported through `VITE_POLARIS_API_ORIGIN`.

The documented Vercel-style `api/` handlers are the concrete backend surface in the public repository. The `selfhost:*` npm scripts should **not** be treated as the primary public self-host path: current project documentation explicitly says `server/` is not a complete standalone Node selfhost application and points public readers to `api/` handlers / the Worker example instead.

### Model provider traffic

For ordinary user-configured providers, the browser can send the built provider request directly when the upstream allows browser access. Polaris can retry through `/api/provider-relay` when provider/runtime retry policy selects relay fallback.

Escape-pod preference:

1. direct provider request when it works;
2. trusted same-origin/private relay as fallback;
3. never depend on an unrelated public relay for private chat traffic.

The relay receives the upstream endpoint, headers and request body, so a relay operator can see traffic routed through it.

### Web Search

Built-in Web Search / webpage read calls `/api/search` and therefore requires a backend route. A static frontend alone is not enough for this feature.

For a personal deployment, the clean shape is same-origin frontend + the small set of `/api` handlers we actually keep.

### MCP on the web

The MCP runtime uses browser `fetch` for Streamable HTTP when not running inside the native iOS/Android bridge. This means a web deployment can call MCP directly only when the MCP endpoint is:

- reachable from the browser;
- compatible with HTTPS/mixed-content rules for the deployed site;
- configured with appropriate CORS behavior;
- able to accept the required MCP headers/session flow.

Therefore the web-first escape pod should **not assume** that every MCP which works in the native app will work from the browser unchanged.

For Ombre Brain or another private MCP, Phase 3 should first try direct HTTPS+CORS access. If that is unsuitable, add a narrowly scoped deployer-owned MCP gateway/relay later. Do not modify the MCP server itself merely to work around Polaris prompt-cache behavior.

### Browser persistence

Current web persistence uses **IndexedDB** (`polaris-db`) for the default persistence backend, with dedicated KV and asset stores. Native iOS/Android use the NativePersistence bridge when available.

Consequences for the web fallback:

- data is local-first and tied to the browser origin/profile;
- redeploying frontend code does not itself migrate data to another browser/device;
- clearing browser site data can destroy the local copy;
- changing the production origin creates a new browser data silo unless data is exported/imported;
- backup/export must remain a first-class feature.

Some small shell/preferences state also uses `localStorage`, but the main web persistence backend is IndexedDB.

### Accounts and access protection

A static Polaris web deployment does **not** create accounts, cloud sync, or a central database. The current concrete public web path also does not provide a general application login gate.

That is acceptable for a personal local-first client because a different visitor receives their own empty origin-local browser state rather than the owner's IndexedDB. It is **not** sufficient protection for shared server-side provider/search secrets or an unrestricted relay.

Escape-pod rule:

- do not build an account system;
- if the deployed site/backend needs to be private, put it behind deployer-owned edge/reverse-proxy access control;
- keep backend CORS narrow;
- rate-limit or otherwise protect any route backed by server-side secrets.

### Mobile web / PWA status

The current `index.html` already includes iOS web-app metadata, an Apple touch icon and a link to `/manifest.webmanifest`.

However, the current public tree does not contain that manifest file and no service-worker registration was found during Phase 0. Treat the existing build as a mobile-friendly web app with **partial home-screen/PWA plumbing**, not a complete offline PWA.

This is not a blocker for Phase 3. If desired later, a real manifest/home-screen package is a small isolated web-polish task; offline model functionality is not a goal.

## iOS -> Web migration map

The existing complete backup path is suitable for migration rather than inventing a new converter.

The structured backup contains:

- conversations/chat state;
- collection cards, projects, project files and workspace reference docs;
- persona state;
- runtime/provider/tool/MCP settings;
- assets and attachments;
- memory documents from the upstream product where present.

The structured importer validates and restores the same domains, including runtime configuration and assets.

Planned migration procedure:

1. Before retiring the current iOS app, create a complete Polaris backup.
2. If the iOS build cannot use local file export, use the existing WebDAV backup fallback.
3. Import that package into the web escape-pod build.
4. Verify conversations, Projects, reference files, attachments, provider selection and MCP configuration.
5. Keep the original backup until at least one full web restore has been tested successfully.

This is **migration**, not real-time multi-device sync.

## Backup security finding

**Treat every complete Polaris backup as a secret-bearing credential archive.**

The exporter writes `stores/runtime.json` directly into the ZIP. The runtime snapshot includes provider profiles, WebDAV configuration and MCP server configuration. Current normalizers preserve:

- provider `apiKey` values;
- WebDAV `password`;
- MCP header values.

No secret-redaction step is present in the structured-export path inspected in Phase 0.

Therefore:

- do not upload backup ZIPs to public GitHub/issues;
- store transfer copies only in trusted locations;
- delete temporary copies after migration;
- consider an optional “backup without credentials” mode later, but do not block Phase 1 on it.

## P0 cache forensic map

### Reproduced live behavior

Normal OpenRouter Claude chat can read prompt cache correctly before MCP/tool history enters the conversation.

Observed after MCP/tool use:

- pre-tool request: roughly 21k input / 21k cache read;
- post-tool requests: roughly 48k-52k input;
- cache read remains near the earlier 21k-23k frontier;
- roughly 27k-29k is repeatedly written;
- adding/removing a custom top-level `cache_control` body did not fix the post-tool behavior.

The earlier Opus 4.7 session was the expensive extreme case: roughly 1.28M prompt tokens, roughly 1.22M cache writes, zero cache reads, and about $8.20 usage.

### Source-level suspect

The OpenAI-compatible adapter's rolling short-lived cache breakpoint currently searches backwards for the latest `conversation` message whose role is `user` or `assistant` and whose text payload is non-empty.

Completed native tool history is later represented as:

```text
assistant + tool_calls
tool + tool_result
```

A native `tool` result is therefore not eligible for that rolling breakpoint, and a tool-call-only assistant message with empty visible text is also not eligible.

This strongly matches the live symptom: the cache frontier can remain before a completed MCP exchange while later requests repeatedly rewrite the tool-result suffix.

This is still a **test hypothesis**, not a Phase-0 code fix. We must verify the legal/portable cache-control shape before modifying the adapter.

## Phase 1 entry contract — cache regression suite

Phase 1 begins with tests, not a patch.

Required regression scenarios:

1. ordinary multi-turn OpenRouter Claude conversation;
2. one native `assistant tool_call -> tool_result -> continuation` exchange;
3. multiple sequential tool exchanges;
4. multiple tool calls in one assistant turn;
5. large MCP/tool result payload;
6. tool-call-only assistant message with empty visible text;
7. next normal user message after a completed tool exchange;
8. Custom Body empty — no user workaround allowed;
9. cache breakpoint/request-shape assertions for OpenRouter Claude;
10. no regression to ordinary OpenAI-compatible providers, images/attachments or transcript fallback mode.

Only after the failing regression is reproduced in code should Phase 2 choose the smallest cache-frontier fix.

Paid validation order remains:

1. Sonnet;
2. only after the test passes, optional Opus confirmation.

Opus is not a unit-test budget.

## Phase 0 source map

High-value source areas inspected:

- `src/ui/worlds/ChatWorld.tsx`
- `src/app/chat/chatReplyRuntime.ts`
- `src/engines/request/requestPreparation.ts`
- `src/engines/request/requestContext.ts`
- `src/engines/request/requestCachePlan.ts`
- `src/engines/provider-runtime/providerRuntimeOpenAiCompatibleAdapter.ts`
- `src/engines/chatApi.ts`
- `src/engines/chat-api/chatApiTransport.ts`
- `src/engines/mcpRuntimeHttp.ts`
- `src/app/chat/chatMcpToolExecutionContext.ts`
- `src/ui/worlds/CollectionWorld.tsx`
- `src/app/collection/useCodeCollectionWorkspaceController.ts`
- `src/stores/collectionStore.ts`
- `src/engines/roomProjectPreview.ts`
- `src/engines/attachmentProcessor.ts`
- `src/app/shell/menuTokenUsage.ts`
- `src/ui/shell/menu/MenuUsagePage.tsx`
- `src/ui/shell/MenuSheet.tsx`
- `src/infrastructure/persistence.ts`
- `src/app/shell/completeBackupExport.ts`
- `src/stores/storeExportPackage.ts`
- `src/stores/storeImportPackage.ts`
- `DEPLOYMENT.md`
- `docs/connect-your-own-backend.md`

## Phase 0 seal

The architecture inventory is complete enough to begin runtime work without guessing at subsystem ownership.

**No runtime/product code was modified in Phase 0.**

Next active phase: **Phase 1 — cache regression suite.**
