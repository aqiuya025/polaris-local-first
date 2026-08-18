# Escape Pod UI Pass 1

Status: **VISUAL REVIEW FAILED · SUPERSEDED BY PASS 2**

## Reference contract

This pass kept the previously agreed reference split:

- **Polaris** remains the engine and state model.
- **Chatnest** is the primary behavioral / layout reference for a quiet Claude-like chat shell. Its implementation code is not copied because its published license differs from Polaris; the Escape Pod styling and JSX are independently implemented.
- **RikkaHub** remains the reference for compact per-message usage telemetry; the Escape Pod keeps its richer `in / read / write / miss / out / cache` line but visually demotes it.

No provider, MCP, cache, request compiler, attachment, project storage, or artifact engine code was changed in this UI pass.

## What Pass 1 got right

- removed collaborator / room / group-oriented product chrome from the desktop sidebar;
- preserved Projects, Artifacts, Recents, Settings and existing conversation actions;
- moved assistant replies away from card/bubble chrome;
- kept cache telemetry and the existing composer wiring;
- isolated Escape Pod styling in a late-cascade file for easier upstream rebases.

## What visual review rejected

The running desktop screenshot showed that Pass 1 copied the **information architecture** but not the **visual proportions** of the agreed Claude / Chatnest references:

- the full-width dark New Chat button was much heavier than either reference;
- the Polaris / Escape Pod brand treatment was too custom and too small;
- the desktop chat had no conversation top bar, leaving a large empty strip;
- per-message assistant identity/model metadata remained visible, making the page feel like a debug client rather than Claude;
- the composer was a thin one-line pill instead of the larger two-row Claude input card;
- sidebar row density, text scale and warm-neutral surfaces were still noticeably unlike the references.

Pass 2 is therefore driven directly by the running screenshot plus current Claude and Chatnest screenshots, rather than by further abstract styling guesses.
