import ora, { type Ora } from "ora";

export interface SpinnerLike {
  start(): SpinnerLike;
  succeed(text?: string): SpinnerLike;
  fail(text?: string): SpinnerLike;
  warn?(text?: string): SpinnerLike;
  text: string;
}

/**
 * Creates a spinner instance. In JSON mode, returns a no-op object
 * that silently swallows all spinner calls so output stays machine-readable.
 */
export function createSpinner(text: string, jsonMode: boolean): SpinnerLike {
  if (jsonMode) {
    const noop: SpinnerLike = {
      start() {
        return noop;
      },
      succeed(_text?: string) {
        return noop;
      },
      fail(_text?: string) {
        return noop;
      },
      warn(_text?: string) {
        return noop;
      },
      text: "",
    };
    return noop;
  }
  return ora({ text, color: "cyan" }) as unknown as SpinnerLike;
}
