# Escape Pod Checkpoint — 2026-08-18

Status: **CACHE PROVIDER-LIVE GREEN · MCP OAUTH WORKING · UI PASS 2 IN PROGRESS · PAUSED FOR REST**

This checkpoint records the state at the end of the 2026-08-18 working session so the project can resume without reconstructing context.

## What is finished

### 1. OpenRouter Claude prompt cache bug

Real provider validation is green.

The original failure pattern was repeated cache write with no useful forward cache read after MCP/native-tool activity. Live forensics showed the underlying cause was not Ombre Brain itself: Polaris Task bookkeeping changed the Anthropic pre-message prefix across tool continuations.

The Escape Pod now:

- preserves the corrected rolling native-tool/tool-result cache frontier;
- request-gates the Polaris Task subsystem off;
- keeps Task source code intact for rebase safety;
- keeps tools/system prefix stable across MCP continuation;
- successfully reuses the expanded post-tool conversation prefix in live OpenRouter Claude Sonnet 4.6 tests.

Observed successful live examples reached 100% displayed cache coverage with roughly:

```text
read 42k · tiny write
read 62k · tiny write
```

The cache strategy remains mixed TTL:

- stable tools/system breakpoints: 1h;
- rolling conversation/tool-result breakpoint: 5m.

### 2. Per-message cache telemetry

Assistant messages expose a compact local usage line containing:

```text
in · read · write · miss · out · cache %
```

This reuses Polaris' existing usage receipts rather than inventing a second accounting path.

Latest visual request: telemetry text has been enlarged from the overly tiny first UI pass while keeping it secondary to message content.

### 3. Web MCP OAuth

Remote MCP OAuth is implemented for Web Escape Pod:

- protected-resource discovery;
- authorization-server metadata discovery;
- dynamic client registration where supported;
- PKCE S256;
- browser popup callback;
- token exchange and local persistence;
- refresh-token retry;
- Bearer injection without overriding an explicitly user-supplied Authorization header.

Real Ombre Brain Web connection works through OAuth.

### 4. Web smoke / CI

Escape Pod Web Smoke checks:

- TypeScript typecheck;
- MCP OAuth regression;
- OpenRouter upstream-forensics regression;
- Escape Pod Task-gate regression;
- production web build.

CI was also hardened for Web-only validation by using Node 22 and skipping the Electron binary download during `npm ci`, avoiding unrelated Electron download failures.

### 5. Product cuts already established

Escape Pod remains a Claude Chat fallback, not a new social/agent platform.

Visible target:

- Chats;
- Projects;
- Artifacts;
- MCP / Web tools;
- provider/model settings;
- usage/cache diagnostics;
- backup/import/export.

Not part of the Escape Pod product surface:

- Polaris built-in memory product;
- Group chat;
- proactive/scheduler/calendar behavior;
- Task ledger;
- collaborator/social simulation surfaces;
- model-driven theme product features.

Underlying implementations are generally gated/hidden first rather than physically deleted, to keep upstream rebases manageable.

## UI state at pause

### Reference contract

- Polaris = engine/state/request runtime.
- Chatnest = primary Claude-like UI/behavior reference only; do not copy implementation code directly because licenses differ.
- Current Claude Web screenshots = direct visual reference.
- RikkaHub = reference for compact per-message usage presentation.

### UI Pass 1

Rejected visually. It got the feature cuts right but looked too much like a custom Polaris skin.

### UI Pass 2

Implemented and being refined from side-by-side screenshots.

Current direction:

- narrower, quieter sidebar;
- simple Polaris wordmark;
- New / Projects / Artifacts rows;
- Chats list with subtle thread dots;
- desktop conversation header with title and current model;
- assistant content directly on the page;
- user messages as neutral light bubbles;
- two-row Claude-like composer;
- current main chat typography is considered acceptable and should not be broadly changed without a new explicit reason.

Latest visual corrections made before pause:

- remove the two apparent outer white/gutter strips caused by desktop shell padding;
- keep the main conversation typography as-is;
- reduce sidebar label/thread font size and weight slightly;
- enlarge `read / write / cache` telemetry by about two visual steps for readability.

## Resume point

No urgent engineering bug remains from today's work.

When resuming, do not reopen cache/OAuth diagnosis unless a regression appears. Continue from visual screenshot comparison only.

Recommended next loop:

1. pull latest `ours` and wait for/confirm Web Smoke;
2. run normal local Web URL (no `?debugUpstream=1` unless cache forensics is needed again);
3. take one full desktop screenshot;
4. compare against current Claude Web / Chatnest reference;
5. adjust only visible mismatches in the late Escape Pod UI override layer.

Avoid another broad redesign. The remaining work is visual refinement, then Projects / Artifacts / Settings presentation cleanup.
