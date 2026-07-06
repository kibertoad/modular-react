// `@angular/compiler` must be imported before any TestBed usage: the published
// Angular packages are partially compiled and fall back to JIT compilation when
// the Angular Linker has not processed them (as under vite/esbuild). The
// non-dynamic `platformBrowserTesting` keeps suites zoneless (AD9) — no zone.js.
import "@angular/compiler";
import { afterEach } from "vitest";
import { getTestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

// TestBed throws if `configureTestingModule` is called after the module was
// already instantiated, so reset between tests for isolation.
afterEach(() => {
  getTestBed().resetTestingModule();
});
