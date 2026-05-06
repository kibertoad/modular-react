import { readFile } from "node:fs/promises";
import { parse } from "oxc-parser";
import type { TransitionDestinationMap } from "../config/types.js";

/**
 * Parse a journey source file and recover the static `{ next | abort | complete }`
 * outcomes of every `transitions[moduleId][entryName][exitName]` handler.
 *
 * Handles handlers written as `() => ({ next: {...} })` or
 * `() => { return { next: {...} } }` and tolerates branches — a handler that
 * returns different shapes on different code paths produces multiple `nexts`
 * entries plus the appropriate `aborts` / `completes` flags.
 *
 * Returns an empty map for any handler the analyzer cannot resolve statically
 * (e.g. computed module/entry names, helper-call returns). The catalog UI
 * gracefully renders unknown destinations as a blank "→" arrow.
 *
 * Errors during parsing are swallowed and logged via the optional `onError`
 * callback — the harvester can collect them but should never fail a build
 * because one journey wasn't statically analyzable.
 */
export async function extractTransitionDestinations(
  filePath: string,
  journeyId: string,
  onError?: (message: string) => void,
): Promise<TransitionDestinationMap> {
  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch (err) {
    onError?.(`read failed: ${(err as Error).message}`);
    return {};
  }

  let program: ReturnType<typeof anyProgram>;
  try {
    const result = await parse(filePath, source, { sourceType: "module", lang: "ts" });
    program = result.program;
  } catch (err) {
    onError?.(`parse failed: ${(err as Error).message}`);
    return {};
  }

  // Find an ObjectExpression whose top-level keys include both `id` (string
  // literal matching journeyId) and `transitions` (an ObjectExpression). This
  // is robust to whichever surface the journey is declared through —
  // `defineJourney(...)({...})`, plain literal, default export, etc.
  const journeyObject = findJourneyObject(program, journeyId);
  if (!journeyObject) return {};

  const transitionsProp = findProperty(journeyObject, "transitions");
  if (!transitionsProp || transitionsProp.value.type !== "ObjectExpression") return {};

  const out: Record<
    string,
    Record<
      string,
      Record<
        string,
        { nexts: { module: string; entry?: string }[]; aborts: boolean; completes: boolean }
      >
    >
  > = {};

  for (const moduleProp of objectProperties(transitionsProp.value)) {
    const moduleId = staticPropertyKey(moduleProp);
    if (moduleId === null) continue;
    if (moduleProp.value.type !== "ObjectExpression") continue;

    for (const entryProp of objectProperties(moduleProp.value)) {
      const entryName = staticPropertyKey(entryProp);
      if (entryName === null) continue;
      if (entryProp.value.type !== "ObjectExpression") continue;

      for (const exitProp of objectProperties(entryProp.value)) {
        const exitName = staticPropertyKey(exitProp);
        if (exitName === null || exitName === "allowBack") continue;

        const outcome = analyzeHandler(exitProp.value);
        if (!outcome) continue;

        ((out[moduleId] ??= {})[entryName] ??= {})[exitName] = outcome;
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// AST helpers — typed loosely as `any` to avoid coupling to oxc-parser's
// internal AST type definitions, which evolve faster than this analyzer needs.
// The small visitor surface used here is stable ESTree-shaped data.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AstNode = any;

function anyProgram(): AstNode {
  return null;
}

function findJourneyObject(program: AstNode, journeyId: string): AstNode | null {
  let found: AstNode | null = null;
  walk(program, (node) => {
    if (found) return;
    if (node?.type !== "ObjectExpression") return;
    const idProp = findProperty(node, "id");
    if (!idProp) return;
    if (idProp.value?.type !== "Literal" || idProp.value.value !== journeyId) return;
    if (!findProperty(node, "transitions")) return;
    found = node;
  });
  return found;
}

function findProperty(obj: AstNode, name: string): AstNode | null {
  for (const prop of objectProperties(obj)) {
    if (staticPropertyKey(prop) === name) return prop;
  }
  return null;
}

function objectProperties(obj: AstNode): AstNode[] {
  if (!obj || obj.type !== "ObjectExpression" || !Array.isArray(obj.properties)) return [];
  // Skip spread elements — we cannot resolve them statically.
  return obj.properties.filter((p: AstNode) => p?.type === "Property");
}

function staticPropertyKey(prop: AstNode): string | null {
  if (!prop || prop.computed) return null;
  const k = prop.key;
  if (!k) return null;
  if (k.type === "Identifier") return k.name as string;
  if (k.type === "Literal" && typeof k.value === "string") return k.value;
  return null;
}

interface HandlerOutcome {
  nexts: { module: string; entry?: string }[];
  aborts: boolean;
  completes: boolean;
  /**
   * True when `nexts` came from a `defineTransition({ targets })` declaration
   * — i.e. the destination set is authoritative, not inferred from handler
   * branches. The catalog UI can surface this as a "declared" badge so
   * authors know the listing is complete (vs the AST best-effort, which can
   * miss branches behind dynamic returns).
   */
  targetsDeclared?: boolean;
}

/**
 * Parse a `targets` literal — `["moduleId/entryName", ...]` — into the
 * `{ module, entry }` shape `nexts` uses. Non-string elements / strings
 * without a `/` separator / strings whose `/` is at either end are skipped
 * (defensive: a hand-rolled call site might pass garbage). Returns `null`
 * when the value is not an array literal at all so callers can distinguish
 * "no targets declared" from "empty targets declared".
 */
function readDeclaredTargets(node: AstNode): { module: string; entry?: string }[] | null {
  if (!node || node.type !== "ArrayExpression" || !Array.isArray(node.elements)) return null;
  const out: { module: string; entry?: string }[] = [];
  for (const el of node.elements) {
    if (!el || el.type !== "Literal" || typeof el.value !== "string") continue;
    // Split on the LAST slash to round-trip scoped module ids ("@scope/foo/entry").
    const slash = el.value.lastIndexOf("/");
    if (slash <= 0 || slash === el.value.length - 1) continue;
    out.push({ module: el.value.slice(0, slash), entry: el.value.slice(slash + 1) });
  }
  return out;
}

function analyzeHandler(value: AstNode): HandlerOutcome | null {
  // Only function expressions / arrows count; literal `{}` etc. are inert.
  if (!value) return null;

  // Unwrap a `defineTransition({ targets, handle })` (or any equivalent
  // curried binder, e.g. `const transition = defineTransition<...>(); transition({...})`).
  //
  // When the wrapper declares `targets`, treat that array as the
  // authoritative `next`-destinations: the whole point of the declaration
  // is to enumerate the possible next steps statically, including the ones
  // hidden behind dynamic `output`-driven ternaries that the AST walk
  // cannot resolve. The inner `handle:` function is still scanned so that
  // `aborts` / `completes` flags reflect any non-`next` outcomes.
  //
  // Bare `defineTransition({ handle })` without `targets` (or an unrelated
  // call expression that happens to take an object argument) falls through
  // to the inner-handle path, preserving the existing AST behavior.
  if (value.type === "CallExpression") {
    const spec = value.arguments?.[0];
    if (spec?.type === "ObjectExpression") {
      const targetsProp = findProperty(spec, "targets");
      const handleProp = findProperty(spec, "handle");
      const declared = targetsProp ? readDeclaredTargets(targetsProp.value) : null;
      const inner = handleProp?.value ? analyzeHandler(handleProp.value) : null;
      if (declared !== null) {
        return {
          nexts: declared,
          aborts: inner?.aborts ?? false,
          completes: inner?.completes ?? false,
          targetsDeclared: true,
        };
      }
      if (inner) return inner;
    }
    return null;
  }

  const isFunction =
    value.type === "ArrowFunctionExpression" || value.type === "FunctionExpression";
  if (!isFunction) return null;

  const outcome: HandlerOutcome = { nexts: [], aborts: false, completes: false };

  // Collect all return-shaped expressions.
  const returns: AstNode[] = [];

  if (value.type === "ArrowFunctionExpression" && value.expression) {
    // Concise arrow: `(...) => <expr>` — body itself is the return value.
    returns.push(unwrapParens(value.body));
  } else {
    // Block body — walk for ReturnStatements, but stop descending into
    // nested function literals so a helper closure doesn't pollute results.
    walkStopAt(value.body, (node) => {
      if (
        node?.type === "ArrowFunctionExpression" ||
        node?.type === "FunctionExpression" ||
        node?.type === "FunctionDeclaration"
      ) {
        return true; // stop
      }
      if (node?.type === "ReturnStatement" && node.argument) {
        returns.push(unwrapParens(node.argument));
      }
      return false;
    });
  }

  for (const ret of returns) classifyReturn(ret, outcome);

  if (outcome.nexts.length === 0 && !outcome.aborts && !outcome.completes) {
    return null;
  }
  return outcome;
}

function unwrapParens(node: AstNode): AstNode {
  let cur = node;
  while (cur?.type === "ParenthesizedExpression") cur = cur.expression;
  return cur;
}

function classifyReturn(node: AstNode, outcome: HandlerOutcome): void {
  if (!node || node.type !== "ObjectExpression") return;
  for (const prop of objectProperties(node)) {
    const key = staticPropertyKey(prop);
    if (key === "next") {
      const dest = readNext(prop.value);
      if (dest) outcome.nexts.push(dest);
    } else if (key === "abort") {
      outcome.aborts = true;
    } else if (key === "complete") {
      outcome.completes = true;
    }
  }
}

function readNext(node: AstNode): { module: string; entry?: string } | null {
  if (!node || node.type !== "ObjectExpression") return null;
  let module: string | null = null;
  let entry: string | undefined;
  for (const prop of objectProperties(node)) {
    const key = staticPropertyKey(prop);
    if (
      key === "module" &&
      prop.value?.type === "Literal" &&
      typeof prop.value.value === "string"
    ) {
      module = prop.value.value;
    } else if (
      key === "entry" &&
      prop.value?.type === "Literal" &&
      typeof prop.value.value === "string"
    ) {
      entry = prop.value.value;
    }
  }
  if (module === null) return null;
  return entry !== undefined ? { module, entry } : { module };
}

/** Depth-first AST walk. Visitor never mutates. */
function walk(node: AstNode, visit: (n: AstNode) => void): void {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc" || key === "range")
      continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) walk(c, visit);
    } else if (child && typeof child === "object") {
      walk(child, visit);
    }
  }
}

/**
 * Like {@link walk} but the visitor returns `true` to stop descent into the
 * current node's children (used to skip nested functions when collecting
 * `ReturnStatement`s).
 */
function walkStopAt(node: AstNode, visit: (n: AstNode) => boolean): void {
  if (!node || typeof node !== "object") return;
  if (visit(node)) return;
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc" || key === "range")
      continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) walkStopAt(c, visit);
    } else if (child && typeof child === "object") {
      walkStopAt(child, visit);
    }
  }
}
