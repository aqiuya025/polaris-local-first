# Escape Pod UI Pass 2

Status: **IMPLEMENTED · CI / VISUAL REVIEW PENDING**

## Why Pass 2 exists

Pass 1 was visually rejected after comparing the running Escape Pod desktop UI against two direct references supplied during review:

1. the current Claude desktop web app;
2. the Chatnest Claude-style implementation.

The problem was not feature selection. The problem was visual proportion and hierarchy: Pass 1 looked like a custom Polaris skin rather than a convincing Claude-like fallback.

## Screenshot-driven corrections

### Sidebar

- reduce desktop sidebar width from the heavier Pass 1 geometry;
- remove the full-width dark New Chat pill;
- render **New / Projects / Artifacts** as quiet icon rows;
- simplify branding to one `Polaris` wordmark;
- rename the recent section to **Chats** and use small thread dots / subtle active rows;
- remove the bordered Settings-card feeling at the bottom.

The sidebar still intentionally omits Group, collaborator creation, image/info/dialogue shelves, Code and Customize because the Escape Pod product scope is smaller than Claude itself.

### Desktop chat header

Pass 1 had no desktop conversation header. Pass 2 adds a compact top bar with:

- current conversation title;
- current / most recent model label;
- model button wired to the existing provider settings entry.

This removes the large unexplained blank strip at the top of the chat world.

### Reading surface

- warm neutral page surface closer to Claude;
- hide per-message `assistant · provider/model · token total` identity metadata on desktop;
- keep assistant replies directly on the page without assistant bubbles;
- increase assistant body text and line-height slightly;
- keep user replies as a neutral light bubble;
- keep RikkaHub-style cache telemetry, but visually demote it below the normal answer/actions.

### Composer

Pass 2 changes only CSS geometry, not request wiring:

- larger ~94px rounded card;
- two-row layout rather than the Pass 1 one-line pill;
- textarea occupies the upper row;
- attachment `+` remains on the lower-left;
- send remains on the lower-right;
- a quiet mistake disclaimer sits below the card.

Attachments, MCP/toolbox, card references, workspace banner, slash commands and streaming stop/send remain connected to the existing Polaris implementation.

## Rebase strategy

Pass 2 is isolated in `src/styles/escape-pod-ui-pass2.css`, imported after Pass 1. This makes the screenshot-driven corrections easy to inspect, revise or drop without rewriting the upstream style graph.

## Next review

After Web Smoke is green:

```bash
git pull
npm run dev
```

Review the normal desktop URL and compare directly against the supplied Claude / Chatnest screenshots. The next iteration should adjust only visible mismatches from the new screenshot instead of making another broad speculative redesign.
