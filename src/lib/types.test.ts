import { describe, it, expect } from "vitest";
import type { Ruleset, Filters, ClassifyPreview } from "./types";

describe("Type definitions", () => {
  it("should create a valid Ruleset object", () => {
    const filters: Filters = {
      extensions: [".jpg", ".png"],
      filename: { pattern: "screenshot_*", match_type: "glob" },
      created_at: null,
      modified_at: null,
    };

    const ruleset: Ruleset = {
      id: "test-id",
      name: "Test ruleset",
      enabled: true,
      source_dir: "/src",
      destination_dir: "/dst",
      action: "move",
      overwrite: false,
      filters,
      auto_classify: false,
    };

    expect(ruleset.id).toBe("test-id");
    expect(ruleset.action).toBe("move");
    expect(ruleset.filters.extensions).toHaveLength(2);
    expect(ruleset.filters.filename?.match_type).toBe("glob");
  });

  it("should allow copy action", () => {
    const ruleset: Ruleset = {
      id: "copy-id",
      name: "Copy test",
      enabled: true,
      source_dir: "/src",
      destination_dir: "/dst",
      action: "copy",
      overwrite: true,
      filters: {
        extensions: [".log"],
        filename: null,
        created_at: null,
        modified_at: null,
      },
      auto_classify: false,
    };

    expect(ruleset.action).toBe("copy");
    expect(ruleset.overwrite).toBe(true);
  });

  it("should allow auto_classify and ClassifyPreview", () => {
    const ruleset: Ruleset = {
      id: "auto-id",
      name: "Auto",
      enabled: true,
      source_dir: "/src",
      destination_dir: "/dst",
      action: "move",
      overwrite: false,
      filters: {
        extensions: [".zip"],
        filename: null,
        created_at: null,
        modified_at: null,
      },
      auto_classify: true,
    };
    const previews: ClassifyPreview[] = [
      { filename: "a.zip", folder: "A", score: 1, reason: null },
      {
        filename: "b.zip",
        folder: null,
        score: 0,
        reason: "Auto-classify: no matching folder",
      },
    ];

    expect(ruleset.auto_classify).toBe(true);
    expect(previews[0].folder).toBe("A");
    expect(previews[1].folder).toBeNull();
  });
});
