---
"@modular-frontend/core": minor
"@modular-react/react": minor
---

React overlays that open in one commit now stack in tree order (parent first): a nested `useModalBehavior` that mounts open lands above its outlet, and a foreign layer open at mount lands above its window and below a modal or a foreign layer nested inside it. The engine adds `OverlayStack.nextOrder()`, an optional `order` argument to `OverlayStack.push`, and an `ordered` capability flag. A key only orders the pushes of one synchronous batch, so a later open always lands above an earlier one, even when an effect re-runs with an older key (an `<Activity>` reveal). `@modular-react/react` uses keys when the flag is set, and on older engines pushes on top as before, with `useOverlayTicket` deferred by one microtask, so its `@modular-frontend/core` peer range is unchanged.
