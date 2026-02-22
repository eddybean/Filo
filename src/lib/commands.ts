import { invoke } from "@tauri-apps/api/core";
import type { Ruleset, ExecutionResult, UndoRequest } from "./types";

export async function getRulesets(): Promise<Ruleset[]> {
  return invoke<Ruleset[]>("get_rulesets");
}

export async function saveRuleset(ruleset: Ruleset): Promise<string> {
  return invoke<string>("save_ruleset", { ruleset });
}

export async function deleteRuleset(id: string): Promise<void> {
  return invoke("delete_ruleset", { id });
}

export async function reorderRulesets(ids: string[]): Promise<void> {
  return invoke("reorder_rulesets", { ids });
}

export async function executeRuleset(id: string): Promise<ExecutionResult> {
  return invoke<ExecutionResult>("execute_ruleset", { id });
}

export async function executeAll(): Promise<ExecutionResult[]> {
  return invoke<ExecutionResult[]>("execute_all");
}

export async function cancelExecution(): Promise<void> {
  return invoke("cancel_execution");
}

export async function undoFile(source: string, dest: string): Promise<void> {
  return invoke("undo_file", { source, dest });
}

export async function undoAll(
  files: UndoRequest[],
): Promise<Array<{ Ok: null } | { Err: string }>> {
  return invoke("undo_all", { files });
}

export async function importRulesets(path: string): Promise<Ruleset[]> {
  return invoke<Ruleset[]>("import_rulesets", { path });
}

export async function exportRulesets(path: string): Promise<void> {
  return invoke("export_rulesets", { path });
}

export async function openInExplorer(path: string): Promise<void> {
  return invoke("open_in_explorer", { path });
}

export async function listSourceFiles(dir: string): Promise<string[]> {
  return invoke<string[]>("list_source_files", { dir });
}
