import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RulesetCard } from "./RulesetCard";
import { renderWithProviders } from "../test/helpers/renderWithProviders";
import { defaultRuleset, copyRuleset, disabledRuleset } from "../test/mocks/fixtures";

vi.mock("../lib/commands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/commands")>();
  return { ...actual, openInExplorer: vi.fn().mockResolvedValue(undefined) };
});

function renderCard(overrides?: {
  ruleset?: typeof defaultRuleset;
  executing?: boolean;
}) {
  const props = {
    ruleset: defaultRuleset,
    index: 0,
    onToggleEnabled: vi.fn(),
    onExecute: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    executing: false,
    ...overrides,
  };
  renderWithProviders(<RulesetCard {...props} />);
  return props;
}

describe("RulesetCard", () => {
  it("ルールセット名とパスが表示される", () => {
    renderCard();
    expect(screen.getByTestId("ruleset-name")).toHaveTextContent(defaultRuleset.name);
    // toHaveTextContent はサブストリングマッチのためバックスラッシュも安全に検索できる
    expect(screen.getByTestId("ruleset-card")).toHaveTextContent(defaultRuleset.source_dir);
  });

  it("チェックボックスを変更すると onToggleEnabled が呼ばれる", async () => {
    const { onToggleEnabled } = renderCard();
    await userEvent.click(screen.getByTestId("ruleset-toggle"));
    expect(onToggleEnabled).toHaveBeenCalledWith(defaultRuleset.id, false);
  });

  it("実行ボタンをクリックすると onExecute が呼ばれる", async () => {
    const { onExecute } = renderCard();
    await userEvent.click(screen.getByTestId("ruleset-execute"));
    expect(onExecute).toHaveBeenCalledWith(defaultRuleset.id);
  });

  it("編集ボタンをクリックすると onEdit が呼ばれる", async () => {
    const { onEdit } = renderCard();
    await userEvent.click(screen.getByTestId("ruleset-edit"));
    expect(onEdit).toHaveBeenCalledWith(defaultRuleset);
  });

  it("削除ボタンをクリックすると onDelete が呼ばれる", async () => {
    const { onDelete } = renderCard();
    await userEvent.click(screen.getByTestId("ruleset-delete"));
    expect(onDelete).toHaveBeenCalledWith(defaultRuleset.id);
  });

  it("enabled=false のカードは opacity-50 クラスを持つ", () => {
    renderCard({ ruleset: disabledRuleset });
    expect(screen.getByTestId("ruleset-card")).toHaveClass("opacity-50");
  });

  it("action=copy のバッジは 'コピー' と表示される", () => {
    renderCard({ ruleset: copyRuleset });
    expect(screen.getByTestId("ruleset-action-badge")).toHaveTextContent("コピー");
  });

  it("メニューボタンをクリックするとサブメニューが表示される", async () => {
    renderCard();
    expect(screen.queryByTestId("ruleset-menu-dropdown")).toBeNull();
    await userEvent.click(screen.getByTestId("ruleset-menu"));
    expect(screen.getByTestId("ruleset-menu-dropdown")).toBeTruthy();
  });

  it("「対象フォルダを開く」をクリックすると openInExplorer が source_dir で呼ばれる", async () => {
    const { openInExplorer } = await import("../lib/commands");
    renderCard();
    await userEvent.click(screen.getByTestId("ruleset-menu"));
    await userEvent.click(screen.getByTestId("ruleset-open-source"));
    expect(openInExplorer).toHaveBeenCalledWith(defaultRuleset.source_dir);
  });

  it("「保存先フォルダを開く」をクリックすると openInExplorer が destination_dir で呼ばれる", async () => {
    const { openInExplorer } = await import("../lib/commands");
    renderCard();
    await userEvent.click(screen.getByTestId("ruleset-menu"));
    await userEvent.click(screen.getByTestId("ruleset-open-destination"));
    expect(openInExplorer).toHaveBeenCalledWith(defaultRuleset.destination_dir);
  });
});
