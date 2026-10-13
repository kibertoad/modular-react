# @modular-react/react

## 2.4.0

### Minor Changes

- [#101](https://github.com/kibertoad/modular-react/pull/101) [`b6cbaa4`](https://github.com/kibertoad/modular-react/commit/b6cbaa4a78e6c1cc83fd726a32505374d56940b2) Thanks [@casamitjana](https://github.com/casamitjana)! - Add `useOverlayTicket(active)`: holds a ticket on the shared overlay stack while a foreign layer (another UI library's menu, popover, select, or dialog) is open inside a hosted overlay, so the overlay's Escape and Tab handling stand down and the foreign library handles its own keys. In React, `useModalBehavior` now re-renders on stack changes only while active. In Vue, overlays that open in one update now stack parent first, also when an already-mounted outlet opens a window that mounts a nested overlay open.

- [#102](https://github.com/kibertoad/modular-react/pull/102) [`34be181`](https://github.com/kibertoad/modular-react/commit/34be1815b5e8d10afa738f08e62fc9bfc5cece56) Thanks [@casamitjana](https://github.com/casamitjana)! - React overlays that open in one commit now stack in tree order (parent first): a nested `useModalBehavior` that mounts open lands above its outlet, and a foreign layer open at mount lands above its window and below a modal or a foreign layer nested inside it. The engine adds `OverlayStack.nextOrder()`, an optional `order` argument to `OverlayStack.push`, and an `ordered` capability flag. A key only orders the pushes of one synchronous batch, so a later open always lands above an earlier one, even when an effect re-runs with an older key (an `<Activity>` reveal). `@modular-react/react` uses keys when the flag is set, and on older engines pushes on top as before, with `useOverlayTicket` deferred by one microtask, so its `@modular-frontend/core` peer range is unchanged.

### Patch Changes

- Updated dependencies []:
  - @modular-react/core@2.7.1
