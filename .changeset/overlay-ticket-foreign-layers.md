---
"@modular-vue/vue": minor
"@modular-vue/core": minor
"@modular-react/react": minor
---

Add `useOverlayTicket(active)`: holds a ticket on the shared overlay stack while a foreign layer (another UI library's menu, popover, select, or dialog) is open inside a hosted overlay, so the overlay's Escape and Tab handling stand down and the foreign library handles its own keys. In React, `useModalBehavior` now re-renders on stack changes only while active. In Vue, overlays that open in one update now stack parent first, also when an already-mounted outlet opens a window that mounts a nested overlay open.
