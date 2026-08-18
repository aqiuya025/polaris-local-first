# Polaris Fork Discussion Board

This file is the persistent discussion area for `aqiuya025/polaris-local-first`.

## Fork policy

- `main` stays close to upstream for future comparison and selective syncing.
- `ours` is the working branch for aqiuya-specific discussion, experiments, fixes, and later deployment work.
- Do not change product/runtime code before a problem, desired behavior, and acceptance test are written down here.
- Prefer small patches that remain understandable against upstream; avoid turning the fork into an unrelated rewrite.

## Product goal: Claude Chat fallback, not a new AI platform

This fork exists as a fallback route when the official Claude chat service is unavailable to aqiuya. If the official Claude chat is usable, returning to the official product remains the preferred path.

Therefore the fork should not compete with Claude feature-for-feature or preserve every Polaris subsystem. The target is a small, reliable, web-first Claude-style chat client with a few genuinely useful Polaris extras.

### Product priorities

1. **Reliability and predictable API cost first.** Prompt caching, especially across MCP/tool history, is a P0 requirement. A feature that silently destroys cache hit rate can make the fallback economically unusable.
2. **Claude-style chat baseline.** Keep strong ordinary chat, files/images, project/reference context, artifact-like workspace output, web access, MCP/connectors, model controls, and useful conversation operations.
3. **Local ownership and escape hatches.** Keep export/import, local-first storage, and practical backup paths so the fallback itself never becomes another lock-in.
4. **Web-first maintenance.** Prefer a browser/self-hosted release path that can be updated by redeploying the fork instead of maintaining a separate iOS App Store/TestFlight channel.
5. **Delete product ambition that is irrelevant to the fallback.** Do not keep a subsystem just because upstream implemented it.

## Feature inventory v0.1

This is the first scope pass. `KEEP` means part of the intended fallback product. `KEEP/SIMPLIFY` means useful capability but its current Polaris product shape may be larger than needed. `HIDE/CUT` means remove from the user-facing product and later decide whether dead code should also be deleted. `DEFER` means no work until the core fallback is stable.

| Polaris capability | Current direction | Why |
| --- | --- | --- |
| Core chat: streaming, submit/stop, retry, edit, fork, long-lived conversation history | **KEEP** | Core Claude-style chat behavior. |
| Provider profiles, model selection, Anthropic/OpenRouter/custom OpenAI-compatible routes | **KEEP** | Essential for a fallback client and price/routing choice. |
| Prompt caching and usage/cost evidence | **KEEP / P0** | Economic viability requirement; must survive MCP/tool history. |
| Attachments, document/image input, attachment inspection/read tools | **KEEP** | Core Claude-style file and image work. |
| MCP / external tools | **KEEP / P0** | Required for Ombre Brain and other user-owned connectors. Must not break caching. |
| Web search + webpage read | **KEEP** | Claude-style web access; already fits chat naturally. |
| Workspace/project files + reference materials | **KEEP/SIMPLIFY** | Closest Polaris equivalent to Claude Projects/project knowledge. |
| Code cards / workspace preview / runnable HTML-CSS-JS output | **KEEP/SIMPLIFY** | Closest Polaris equivalent to useful Artifacts. Keep the good execution/preview path, simplify the surrounding product vocabulary later. |
| `runCode` sandbox | **KEEP, REVIEW SECURITY** | Useful Claude-style analysis/file-generation primitive; verify web deployment behavior and isolation before relying on it. |
| Collaborator/persona identity + prompt/model configuration | **KEEP/SIMPLIFY** | Useful as a role/project configuration surface, but should not drag Polaris memory or social simulation back in. |
| Collection/saved materials | **KEEP/SIMPLIFY** | Useful if it remains the storage layer for projects/artifacts/files; remove ornamental card taxonomy if it adds maintenance cost. |
| Export/import and local data diagnostics | **KEEP** | Critical fallback safety and migration path. |
| WebDAV backup | **KEEP FOR NOW** | Useful user-owned backup/transfer path; not real-time sync. |
| Built-in Polaris memory, confirmed memory, memory docs as a memory system | **HIDE/CUT** | User does not want a second proprietary memory layer; Ombre Brain remains the external memory path when wanted. |
| Cross-conversation semantic recall / vector memory / generated conversation summaries | **HIDE/CUT** | Adds context/caching complexity and duplicates the external memory strategy. |
| Group chat, member lanes, turn scheduler, room social behavior | **HIDE/CUT** | Not needed for a Claude Chat emergency fallback. |
| Proactive/scheduled messages and notification workflow | **HIDE/CUT** | Not needed; avoid background product complexity. |
| Calendar / personal-data tools | **HIDE/CUT FOR NOW** | Not part of the minimal fallback goal; can always return via MCP later. |
| Task state / wait polling | **HIDE/CUT FOR NOW** | More agent/workflow product than ordinary Claude-style chat. Re-evaluate only if a real use case appears. |
| Theme-editing tools / model-driven CSS modification | **HIDE/CUT** | High maintenance, unrelated to fallback reliability. A normal fixed UI/theme is enough. |
| QR generation | **HIDE/CUT** | Nice utility, irrelevant to core fallback. |
| Built-in image generation / image variants / palette tools | **DEFER / probably cut** | Claude chat fallback does not require a separate image-generation product surface. |
| Voice/TTS | **DEFER** | Nice parity feature, but not before chat, files, projects, MCP and caching are solid. |
| Native desktop filesystem/terminal companion tools | **DEFER / web-first off** | Native-only maintenance burden. External MCP can cover user-owned tools later if needed. |
| iOS / Android native wrappers | **DEFER** | Forked source cannot update the original App Store binary. Web-first avoids maintaining a signing/release channel. |
| Built-in free model gateway / broad public backend product | **DEFER** | This is a personal fallback, not a public hosted AI service. |
| Polaris product-knowledge assistant / environment-directory meta tools | **REVIEW, likely hide** | Useful to upstream product support, but likely clutter in a small personal fallback. |

### Desired user-facing shape

The likely end-state is intentionally small:

- **Chats** — normal Claude-style conversations, file/image upload, model controls, edit/retry/fork, usage visibility.
- **Projects** — project instructions + reference files + related chats.
- **Artifacts / Workspace** — generated code/text/web artifacts with preview and editable project files.
- **Tools** — MCP connectors plus web search; other tool groups only when they prove useful.
- **Settings** — providers/API routes, caching diagnostics, backup/import/export, minimal appearance settings.

Everything else must justify its maintenance cost.

### Important non-goals

- No attempt to reproduce Claude account memory.
- No social/group-agent simulation.
- No scheduler/proactive companion behavior.
- No public multi-user service, billing system, or account platform.
- No requirement to match every Claude Cowork/Office/enterprise feature.
- No requirement to keep upstream Polaris terminology if a simpler Claude-like information architecture is clearer.

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

As of this note, no runtime fix has been applied in the fork. Fork-specific changes on `ours` are discussion/documentation only.
