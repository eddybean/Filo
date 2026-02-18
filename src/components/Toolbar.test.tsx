import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toolbar } from "./Toolbar";
import { renderWithProviders } from "../test/helpers/renderWithProviders";

function renderToolbar(overrides?: { executing?: boolean }) {
  const props = {
    onCreateNew: vi.fn(),
    onExecuteAll: vi.fn(),
    onImport: vi.fn(),
    onExport: vi.fn(),
    executing: false,
    ...overrides,
  };
  renderWithProviders(<Toolbar {...props} />);
  return props;
}

describe("Toolbar", () => {
  it("新規作成ボタンをクリックすると onCreateNew が呼ばれる", async () => {
    const { onCreateNew } = renderToolbar();
    await userEvent.click(screen.getByTestId("toolbar-create"));
    expect(onCreateNew).toHaveBeenCalledOnce();
  });

  it("一括実行ボタンをクリックすると onExecuteAll が呼ばれる", async () => {
    const { onExecuteAll } = renderToolbar();
    await userEvent.click(screen.getByTestId("toolbar-execute-all"));
    expect(onExecuteAll).toHaveBeenCalledOnce();
  });

  it("executing=true のとき一括実行ボタンが disabled になる", () => {
    renderToolbar({ executing: true });
    expect(screen.getByTestId("toolbar-execute-all")).toBeDisabled();
  });

  it("インポートボタンをクリックすると onImport が呼ばれる", async () => {
    const { onImport } = renderToolbar();
    await userEvent.click(screen.getByTestId("toolbar-import"));
    expect(onImport).toHaveBeenCalledOnce();
  });

  it("エクスポートボタンをクリックすると onExport が呼ばれる", async () => {
    const { onExport } = renderToolbar();
    await userEvent.click(screen.getByTestId("toolbar-export"));
    expect(onExport).toHaveBeenCalledOnce();
  });
});
