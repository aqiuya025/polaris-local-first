# Escape Pod UI Pass 1

Status: **IMPLEMENTED · CI / VISUAL REVIEW PENDING**

## Reference contract

This pass keeps the previously agreed reference split:

- **Polaris** remains the engine and state model.
- **Chatnest** is the primary behavioral / layout reference for a quiet Claude-like chat shell. Its implementation code is not copied because its published license differs from Polaris; the Escape Pod styling and JSX are independently implemented.
- **RikkaHub** remains the reference for compact per-message usage telemetry; the Escape Pod keeps its richer `in / read / write / miss / out / cache` line but visually demotes it.

No provider, MCP, cache, request compiler, attachment, project storage, or artifact engine code is changed in this UI pass.

## Pass 1 scope

### Desktop sidebar

`src/ui/app-shell/DesktopAppSidebar.tsx` is reduced from the upstream collaborator / room / group-oriented navigation to the Escape Pod shell:

- Polaris / Escape Pod brand row;
- prominent New Chat action;
- only **Projects** and **Artifacts** collection entrances;
- recent conversation list with existing pin / rename / delete actions preserved;
- Settings at the bottom;
- Group navigation, collaborator picker, collaborator creation, image/info/dialogue shelves and collaborator footer copy are hidden from the product surface.

The underlying callbacks and upstream subsystems are intentionally not deleted yet.

### Chat reading surface

`src/styles/escape-pod-ui.css` adds a late-cascade Escape Pod skin:

- centered ~760px reading column;
- larger vertical turn spacing;
- assistant replies lose the card/bubble chrome and read directly on the page;
- user messages keep a small neutral rounded bubble;
- assistant avatars are hidden on desktop to reduce the IM / social-agent feel;
- assistant identity metadata, actions and cache telemetry remain available but quieter;
- upstream Task runtime cards are hidden in the Escape Pod desktop shell (Task is already request-gated off).

### Composer

The existing composer wiring is preserved, including attachments, MCP/toolbox access, card refs, workspace banner, streaming stop/send and slash commands. Only geometry and chrome change:

- centered with the reading column;
- larger 27px rounded input card;
- neutral surface and restrained shadow;
- calmer attachment/tool buttons;
- circular high-contrast send button only when content is ready.

### Rebase strategy

The visual overrides live in a dedicated file imported last from `src/styles/base.css`. This intentionally avoids rewriting the large upstream style graph and keeps future upstream rebases tractable.

## Visual review checklist

After CI passes:

```bash
git pull
npm run dev
```

Open the normal local URL without the upstream forensic query flag. Review at desktop width first:

1. sidebar hierarchy and width;
2. New Chat prominence;
3. Projects / Artifacts labels;
4. recent-chat density;
5. assistant text line length and vertical rhythm;
6. user bubble width;
7. composer height / position;
8. usage/cache line visibility;
9. light and dark appearance.

The next UI pass should be driven by screenshots from the running build rather than further speculative styling.
