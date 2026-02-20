import { create } from "zustand";
import type { Ruleset, ExecutionResult } from "../lib/types";
import * as commands from "../lib/commands";

interface RulesetState {
  rulesets: Ruleset[];
  loading: boolean;
  error: string | null;
  executionResults: ExecutionResult[];

  fetchRulesets: () => Promise<void>;
  saveRuleset: (ruleset: Ruleset) => Promise<void>;
  deleteRuleset: (id: string) => Promise<void>;
  duplicateRuleset: (id: string) => Promise<void>;
  reorderRulesets: (ids: string[]) => Promise<void>;
  executeRuleset: (id: string) => Promise<ExecutionResult>;
  executeAll: () => Promise<ExecutionResult[]>;
  clearResults: () => void;
}

export const useRulesetStore = create<RulesetState>((set, get) => ({
  rulesets: [],
  loading: false,
  error: null,
  executionResults: [],

  fetchRulesets: async () => {
    set({ loading: true, error: null });
    try {
      const rulesets = await commands.getRulesets();
      set({ rulesets, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  saveRuleset: async (ruleset: Ruleset) => {
    await commands.saveRuleset(ruleset);
    await get().fetchRulesets();
  },

  deleteRuleset: async (id: string) => {
    try {
      await commands.deleteRuleset(id);
      await get().fetchRulesets();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  duplicateRuleset: async (id: string) => {
    try {
      const { rulesets } = get();
      const original = rulesets.find((r) => r.id === id);
      if (!original) return;

      const existingNames = new Set(rulesets.map((r) => r.name));
      const newName = generateCopyName(original.name, existingNames);

      const newId = await commands.saveRuleset({ ...original, id: "", name: newName });
      await get().fetchRulesets();

      const updatedIds = get().rulesets.map((r) => r.id);
      const filteredIds = updatedIds.filter((i) => i !== newId);
      const originalIdx = filteredIds.findIndex((i) => i === id);
      if (originalIdx === -1) return;

      const reorderedIds = [
        ...filteredIds.slice(0, originalIdx + 1),
        newId,
        ...filteredIds.slice(originalIdx + 1),
      ];

      await commands.reorderRulesets(reorderedIds);
      await get().fetchRulesets();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  reorderRulesets: async (ids: string[]) => {
    try {
      await commands.reorderRulesets(ids);
      await get().fetchRulesets();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  executeRuleset: async (id: string) => {
    const result = await commands.executeRuleset(id);
    set((state) => ({
      executionResults: [...state.executionResults, result],
    }));
    return result;
  },

  executeAll: async () => {
    const results = await commands.executeAll();
    set({ executionResults: results });
    return results;
  },

  clearResults: () => set({ executionResults: [] }),
}));

function generateCopyName(name: string, existingNames: Set<string>): string {
  const base = name.replace(/ copy\d+$/, "");
  let counter = 1;
  let candidate = `${base} copy${counter}`;
  while (existingNames.has(candidate)) {
    counter++;
    candidate = `${base} copy${counter}`;
  }
  return candidate;
}
