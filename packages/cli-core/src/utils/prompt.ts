import * as p from "@clack/prompts";

/**
 * Run a `@clack/prompts` text prompt and unwrap the result. Exits the
 * process cleanly on Ctrl-C / cancellation so callers don't have to
 * shepherd the cancel symbol through every prompt site.
 */
export async function promptText(options: Parameters<typeof p.text>[0]): Promise<string> {
  const value = await p.text(options);
  if (p.isCancel(value)) {
    p.cancel("Cancelled");
    process.exit(0);
  }
  return value;
}

/**
 * Bail out cleanly when the user hits Ctrl-C on a prompt. Use after any
 * prompt whose result is consumed without going through {@link promptText}
 * (e.g. when the value is conditionally derived from a flag fallback).
 */
export function exitIfCancelled(value: unknown): void {
  if (p.isCancel(value)) {
    p.cancel("Cancelled");
    process.exit(0);
  }
}
