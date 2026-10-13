# @modular-vue/vue

## 1.5.0

### Minor Changes

- [#101](https://github.com/kibertoad/modular-react/pull/101) [`b6cbaa4`](https://github.com/kibertoad/modular-react/commit/b6cbaa4a78e6c1cc83fd726a32505374d56940b2) Thanks [@casamitjana](https://github.com/casamitjana)! - Add `useOverlayTicket(active)`: holds a ticket on the shared overlay stack while a foreign layer (another UI library's menu, popover, select, or dialog) is open inside a hosted overlay, so the overlay's Escape and Tab handling stand down and the foreign library handles its own keys. In React, `useModalBehavior` now re-renders on stack changes only while active. In Vue, overlays that open in one update now stack parent first, also when an already-mounted outlet opens a window that mounts a nested overlay open.

### Patch Changes

- Updated dependencies [[`34be181`](https://github.com/kibertoad/modular-react/commit/34be1815b5e8d10afa738f08e62fc9bfc5cece56)]:
  - @modular-frontend/core@0.7.0
