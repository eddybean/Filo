import { describe, it, expect, beforeEach, vi } from "vitest";
import { useRulesetStore } from "./rulesetStore";
import { setupTauriMocks } from "../test/mocks/tauri";
import { defaultRuleset, defaultExecutionResult } from "../test/mocks/fixtures";

function resetStore() {
  useRulesetStore.setState({
    rulesets: [],
    loading: false,
    error: null,
    executionResults: [],
  });
}

describe("rulesetStore", () => {
  beforeEach(() => {
    resetStore();
    setupTauriMocks();
  });

  it("fetchRulesets を呼ぶと IPC からルールセットを取得してストアに反映する", async () => {
    await useRulesetStore.getState().fetchRulesets();

    const { rulesets, loading, error } = useRulesetStore.getState();
    expect(rulesets).toHaveLength(1);
    expect(rulesets[0].id).toBe(defaultRuleset.id);
    expect(loading).toBe(false);
    expect(error).toBeNull();
  });

  it("saveRuleset を呼ぶと save IPC と fetch IPC が順番に実行される", async () => {
    const saveSpy = vi.fn().mockReturnValue(null);
    const fetchSpy = vi.fn().mockReturnValue([defaultRuleset]);

    setupTauriMocks({
      save_ruleset: saveSpy,
      get_rulesets: fetchSpy,
    });

    await useRulesetStore.getState().saveRuleset(defaultRuleset);

    expect(saveSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(useRulesetStore.getState().rulesets).toHaveLength(1);
  });

  it("deleteRuleset を呼ぶと delete IPC と fetch IPC が順番に実行される", async () => {
    const deleteSpy = vi.fn().mockReturnValue(null);
    const fetchSpy = vi.fn().mockReturnValue([]);

    setupTauriMocks({
      delete_ruleset: deleteSpy,
      get_rulesets: fetchSpy,
    });

    await useRulesetStore.getState().deleteRuleset(defaultRuleset.id);

    expect(deleteSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(useRulesetStore.getState().rulesets).toHaveLength(0);
  });

  it("IPC が失敗したとき error フィールドが設定される", async () => {
    setupTauriMocks({
      get_rulesets: () => {
        throw new Error("接続失敗");
      },
    });

    await useRulesetStore.getState().fetchRulesets();

    const { error, loading } = useRulesetStore.getState();
    expect(error).toBeTruthy();
    expect(loading).toBe(false);
  });

  it("executeRuleset を呼ぶと executionResults に結果が追加される", async () => {
    await useRulesetStore.getState().executeRuleset(defaultRuleset.id);

    const { executionResults } = useRulesetStore.getState();
    expect(executionResults).toHaveLength(1);
    expect(executionResults[0].ruleset_id).toBe(defaultExecutionResult.ruleset_id);
  });
});
