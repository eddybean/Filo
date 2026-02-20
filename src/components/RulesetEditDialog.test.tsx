import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RulesetEditDialog } from "./RulesetEditDialog";
import { renderWithProviders } from "../test/helpers/renderWithProviders";
import { defaultRuleset } from "../test/mocks/fixtures";

// @tauri-apps/plugin-dialog の confirm をモック化
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

function renderDialog(overrides?: { ruleset?: typeof defaultRuleset | null }) {
  const props = {
    ruleset: null as typeof defaultRuleset | null,
    onSave: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
    onSelectFolder: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
  renderWithProviders(<RulesetEditDialog {...props} />);
  return props;
}

describe("RulesetEditDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("名前未入力で保存するとバリデーションエラーが表示される", async () => {
    renderDialog();
    // ソースフォルダと拡張子は設定するが名前は空のまま
    await userEvent.type(screen.getByTestId("field-source-dir"), "C:\\src");
    await userEvent.type(screen.getByTestId("field-dest-dir"), "C:\\dst");
    await userEvent.type(screen.getByTestId("extension-input"), ".jpg");
    await userEvent.click(screen.getByTestId("btn-extension-add"));

    await userEvent.click(screen.getByTestId("btn-save"));

    await waitFor(() => {
      expect(screen.getByTestId("validation-errors")).toBeInTheDocument();
    });
    expect(screen.getByTestId("validation-errors")).toHaveTextContent("名前");
  });

  it("フィルタなしで保存するとバリデーションエラーが表示される", async () => {
    renderDialog();
    await userEvent.type(screen.getByTestId("field-name"), "テスト");
    await userEvent.type(screen.getByTestId("field-source-dir"), "C:\\src");
    await userEvent.type(screen.getByTestId("field-dest-dir"), "C:\\dst");
    // フィルタを追加しない

    await userEvent.click(screen.getByTestId("btn-save"));

    await waitFor(() => {
      expect(screen.getByTestId("validation-errors")).toBeInTheDocument();
    });
  });

  it("拡張子を追加・削除できる", async () => {
    renderDialog();
    await userEvent.type(screen.getByTestId("extension-input"), ".png");
    await userEvent.click(screen.getByTestId("btn-extension-add"));

    // 拡張子タグが表示されることを確認（toHaveTextContent でサブストリング検索）
    expect(screen.getByTestId("edit-dialog")).toHaveTextContent(".png");

    // 削除ボタン：aria-label のない × ボタンが拡張子削除用（閉じるボタンは aria-label 付き）
    const removeButtons = screen.getAllByRole("button", { name: "×" });
    await userEvent.click(removeButtons[0]);

    expect(screen.getByTestId("edit-dialog")).not.toHaveTextContent(".png");
  });

  it("有効なデータで保存すると onSave が呼ばれる", async () => {
    const { onSave } = renderDialog();
    await userEvent.type(screen.getByTestId("field-name"), "テストルール");
    await userEvent.type(screen.getByTestId("field-source-dir"), "C:\\src");
    await userEvent.type(screen.getByTestId("field-dest-dir"), "C:\\dst");
    await userEvent.type(screen.getByTestId("extension-input"), ".jpg");
    await userEvent.click(screen.getByTestId("btn-extension-add"));

    await userEvent.click(screen.getByTestId("btn-save"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledOnce();
    });
    const saved = onSave.mock.calls[0][0];
    expect(saved.name).toBe("テストルール");
    expect(saved.filters.extensions).toContain(".jpg");
  });

  it("変更なしでキャンセルすると confirm なしで onCancel が呼ばれる", async () => {
    const { onCancel } = renderDialog();
    const { confirm } = await import("@tauri-apps/plugin-dialog");

    await userEvent.click(screen.getByTestId("btn-cancel"));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("変更ありでキャンセルすると confirm が呼ばれる", async () => {
    const { onCancel } = renderDialog();
    const { confirm } = await import("@tauri-apps/plugin-dialog");

    // フォームを変更する
    await userEvent.type(screen.getByTestId("field-name"), "変更あり");

    await userEvent.click(screen.getByTestId("btn-cancel"));

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledOnce();
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("保存先にテンプレート変数を使い正規表現以外のフィルタで保存するとバリデーションエラーが表示される", async () => {
    renderDialog();
    await userEvent.type(screen.getByTestId("field-name"), "テストルール");
    await userEvent.type(screen.getByTestId("field-source-dir"), "C:\\src");
    // テンプレート変数を含む destination_dir（{} は userEvent の特殊文字のため {{ }} でエスケープ）
    await userEvent.type(screen.getByTestId("field-dest-dir"), "C:\\dst\\{{label}}");
    // 拡張子フィルタを追加（正規表現なし）
    await userEvent.type(screen.getByTestId("extension-input"), ".zip");
    await userEvent.click(screen.getByTestId("btn-extension-add"));

    await userEvent.click(screen.getByTestId("btn-save"));

    await waitFor(() => {
      expect(screen.getByTestId("validation-errors")).toBeInTheDocument();
    });
    expect(screen.getByTestId("validation-errors")).toHaveTextContent("正規表現");
  });
});
