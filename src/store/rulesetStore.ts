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
    try {
      await commands.saveRuleset(ruleset);
      await get().fetchRulesets();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteRuleset: async (id: string) => {
    try {
      await commands.deleteRuleset(id);
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
