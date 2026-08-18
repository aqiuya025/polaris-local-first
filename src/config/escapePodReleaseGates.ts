// Product-level release gates for the Escape Pod profile.
//
// These gates intentionally disable product surfaces without deleting the
// underlying upstream implementation. That keeps rebases and later recovery
// straightforward while the Escape Pod stays focused on a small Claude-style
// chat / projects / artifacts / tools surface.
export const ESCAPE_POD_RELEASE_GATES = {
  taskSubsystem: false
} as const;
