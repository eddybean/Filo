import type { Ruleset, ExecutionResult } from "../../lib/types";

export const defaultRuleset: Ruleset = {
  id: "test-uuid-1",
  name: "テストルールセット",
  enabled: true,
  source_dir: "C:\\Users\\test\\Downloads",
  destination_dir: "C:\\Users\\test\\Documents",
  action: "move",
  overwrite: false,
  filters: {
    extensions: [".jpg", ".png"],
    filename: null,
    created_at: null,
    modified_at: null,
  },
};

export const copyRuleset: Ruleset = {
  ...defaultRuleset,
  id: "test-uuid-2",
  name: "コピーテストルール",
  action: "copy",
};

export const disabledRuleset: Ruleset = {
  ...defaultRuleset,
  id: "test-uuid-3",
  name: "無効ルールセット",
  enabled: false,
};

export const defaultExecutionResult: ExecutionResult = {
  ruleset_id: "test-uuid-1",
  ruleset_name: "テストルールセット",
  action: "move",
  status: "Completed",
  succeeded: [
    {
      filename: "photo.jpg",
      source_path: "C:\\Users\\test\\Downloads\\photo.jpg",
      destination_path: "C:\\Users\\test\\Documents\\photo.jpg",
      reason: null,
    },
  ],
  skipped: [],
  errors: [],
};
