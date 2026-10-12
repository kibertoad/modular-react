---
"@modular-frontend/core": minor
"@modular-react/react": minor
---

React overlays that open in one commit now stack in tree order (parent first): a nested `useModalBehavior` that mounts open lands above its outlet, and a foreign layer open at mount lands above its window and below a modal nested inside it. The engine adds an optional render-order key, `OverlayStack.push(order?)`, and an `ordered` capability flag. `@modular-react/react` uses the key when the flag is set, and keeps its earlier ordering on older engines, so its `@modular-frontend/core` peer range is unchanged.
