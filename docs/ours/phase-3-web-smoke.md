# Phase 3 Web Smoke / 本地网页实测

Status: **LOCAL SMOKE READY · LIVE PROVIDER VALIDATION PENDING**

## Goal

Run the `ours` branch as a local web app before public/private deployment, connect OpenRouter Claude and the real Ombre Brain MCP, and inspect prompt-cache accounting on every assistant request/continuation.

Deployment is not required for this first desktop test. Polaris is already a Vite web app.

## Local run

```bash
git clone https://github.com/aqiuya025/polaris-local-first.git
cd polaris-local-first
git switch ours
npm ci
npm run dev
```

Open the local URL printed by Vite.

A separate GitHub Actions smoke workflow also runs TypeScript checking and a production web build:

- `.github/workflows/escape-pod-web-smoke.yml`

## Per-message cache telemetry

The escape-pod chat UI now renders a quiet usage line beneath every assistant reply/continuation when provider usage is available.

Current fields:

- `in` — input tokens;
- `read` — prompt-cache read tokens;
- `write` — prompt-cache creation/write tokens;
- `miss` — prompt-cache miss tokens;
- `out` — output tokens;
- `cache` — read rate over reported `read + miss` tokens.

Example:

```text
in 48.7k · read 21.1k · write 27.6k · miss 27.6k · out 145 · cache 43%
```

This borrows the useful “nerd line under each message” interaction idea from RikkaHub, but uses Polaris's existing richer `ChatTokenUsage` data instead of copying RikkaHub's data model or implementation.

Relevant source:

- `src/ui/worlds/chat/message/MessageUsageLine.tsx`
- `src/ui/worlds/chat/message/MessageRow.tsx`
- `src/engines/provider-runtime/providerRuntimeUsage.ts`

No cost estimate is shown yet; cache correctness is the first diagnostic target and provider/model pricing is a separate concern.

## Paid live validation sequence

Use OpenRouter Sonnet first with Custom Body empty.

1. Start a fresh chat and make enough ordinary turns to observe a cache read.
2. Invoke Ombre Brain through MCP and request a substantial result.
3. Observe the assistant/tool continuation usage lines.
4. The first request that extends the prefix may contain a large cache write.
5. On the following stable request, `read` should advance to include the post-MCP prefix instead of remaining stuck at the old pre-MCP value.
6. Repeat one more ordinary turn to make sure the frontier continues normally.

Expected healthy pattern is conceptually:

```text
before MCP: read ~21k
MCP extension: write ~27k once
next stable request: read approaches the new ~48k prefix
```

Do not use Opus for the first live validation.

## Browser MCP caveat

Native Polaris can use Capacitor HTTP for MCP; the web build uses browser `fetch` for Streamable HTTP. Therefore the existing Ombre Brain endpoint must be reachable from the browser and satisfy HTTPS/CORS requirements.

If OB fails only in the web build with a browser CORS/mixed-content error, treat that as a web transport problem, not a prompt-cache regression. First prefer allowing the trusted local/deployed Polaris origin at the MCP edge. If that is unsuitable, consider a narrowly scoped deployer-owned MCP relay later.
