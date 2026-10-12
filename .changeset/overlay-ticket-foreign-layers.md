---
"@modular-vue/vue": minor
"@modular-vue/core": minor
"@modular-react/react": minor
---

Add `useOverlayTicket(active)`: holds a ticket on the shared overlay stack while a foreign layer (another UI library's menu, popover, select, or dialog) is open inside a hosted overlay, so the overlay's Escape and Tab handling stand down and the foreign library handles its own keys. In React, `useModalBehavior` now re-renders on stack changes only while active.
