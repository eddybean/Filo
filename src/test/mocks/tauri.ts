import { mockIPC } from "@tauri-apps/api/mocks";
import type { Ruleset, ExecutionResult } from "../../lib/types";
import { defaultRuleset, defaultExecutionResult } from "./fixtures";

export type IPCOverrides = {
  get_rulesets?: () => Ruleset[];
  save_ruleset?: (args: { ruleset: Ruleset }) => null;
  delete_ruleset?: (args: { id: string }) => null;
  reorder_rulesets?: (args: { ids: string[] }) => null;
  execute_ruleset?: (args: { id: string }) => ExecutionResult;
  execute_all?: () => ExecutionResult[];
  undo_file?: (args: { source: string; dest: string }) => null;
  undo_all?: (args: unknown) => Array<{ Ok: null }>;
  import_rulesets?: (args: { path: string }) => Ruleset[];
  export_rulesets?: (args: { path: string }) => null;
};

export function setupTauriMocks(overrides?: IPCOverrides): void {
  const handlers: Record<string, (args: unknown) => unknown> = {
    get_rulesets: () => [defaultRuleset],
    save_ruleset: () => null,
    delete_ruleset: () => null,
    reorder_rulesets: () => null,
    execute_ruleset: () => defaultExecutionResult,
    execute_all: () => [defaultExecutionResult],
    undo_file: () => null,
    undo_all: () => [{ Ok: null }],
    import_rulesets: () => [defaultRuleset],
    export_rulesets: () => null,
    ...overrides,
  };

  mockIPC((cmd, args) => {
    if (cmd in handlers) {
      return handlers[cmd]!(args);
    }
    throw new Error(`Unhandled IPC command: ${cmd}`);
  });
}
