import { describe, it, expect } from "vitest";
import type { Ruleset, Filters } from "./types";

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
    };

    expect(ruleset.action).toBe("copy");
    expect(ruleset.overwrite).toBe(true);
  });
});
