import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutoClassifyPreviewPanel } from "./AutoClassifyPreviewPanel";
import { renderWithProviders } from "../test/helpers/renderWithProviders";

vi.mock("../lib/commands", () => ({
  listSourceFiles: vi.fn(),
  previewAutoClassify: vi.fn(),
}));

import * as commands from "../lib/commands";

function renderPanel(props?: Partial<Parameters<typeof AutoClassifyPreviewPanel>[0]>) {
  renderWithProviders(
    <AutoClassifyPreviewPanel
      sourceDir="C:/src"
      destinationDir="C:/dst"
      extensions={null}
      {...props}
    />,
  );
}

describe("AutoClassifyPreviewPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ヒントが表示される", () => {
    renderPanel();
    expect(screen.getByTestId("auto-classify-preview-panel")).toHaveTextContent(
      "サブフォルダ",
    );
  });

  it("対象フォルダか保存先が未指定のとき確認ボタンが無効になる", () => {
    renderPanel({ sourceDir: "" });
    expect(screen.getByTestId("auto-classify-load-btn")).toBeDisabled();
  });

  it("確認ボタンを押すと判定結果が一覧表示される", async () => {
    vi.mocked(commands.listSourceFiles).mockResolvedValue([
      "[夏目漱石] こころ.txt",
      "random_notes.txt",
    ]);
    vi.mocked(commands.previewAutoClassify).mockResolvedValue([
      { filename: "[夏目漱石] こころ.txt", folder: "夏目漱石", score: 1, reason: null },
      {
        filename: "random_notes.txt",
        folder: null,
        score: 0,
        reason: "Auto-classify: no matching folder",
      },
    ]);
    renderPanel();

    await userEvent.click(screen.getByTestId("auto-classify-load-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("auto-classify-result-list")).toBeInTheDocument();
    });
    expect(commands.listSourceFiles).toHaveBeenCalledWith("C:/src");
    expect(commands.previewAutoClassify).toHaveBeenCalledWith("C:/dst", [
      "[夏目漱石] こころ.txt",
      "random_notes.txt",
    ]);
    const rows = screen.getAllByTestId("auto-classify-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("[夏目漱石] こころ.txt");
    expect(rows[0]).toHaveTextContent("夏目漱石");
    expect(rows[1]).toHaveTextContent("random_notes.txt");
    expect(rows[1]).toHaveTextContent("該当フォルダなし");
    expect(screen.getByTestId("auto-classify-match-count")).toHaveTextContent("1 / 2");
  });

  it("拡張子フィルタがあるとき一致するファイルだけを判定する", async () => {
    vi.mocked(commands.listSourceFiles).mockResolvedValue([
      "a.ZIP",
      "b.txt",
      "c.zip",
    ]);
    vi.mocked(commands.previewAutoClassify).mockResolvedValue([]);
    renderPanel({ extensions: [".zip"] });

    await userEvent.click(screen.getByTestId("auto-classify-load-btn"));

    await waitFor(() => {
      expect(commands.previewAutoClassify).toHaveBeenCalledWith("C:/dst", [
        "a.ZIP",
        "c.zip",
      ]);
    });
  });

  it("判定がどちらとも言えないとき理由が表示される", async () => {
    vi.mocked(commands.listSourceFiles).mockResolvedValue(["x.zip"]);
    vi.mocked(commands.previewAutoClassify).mockResolvedValue([
      {
        filename: "x.zip",
        folder: null,
        score: 0.27,
        reason: "Auto-classify: ambiguous between 'A' and 'B'",
      },
    ]);
    renderPanel();

    await userEvent.click(screen.getByTestId("auto-classify-load-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("auto-classify-row")).toHaveTextContent("候補が拮抗");
    });
    expect(screen.getByTestId("auto-classify-row")).toHaveTextContent("A");
    expect(screen.getByTestId("auto-classify-row")).toHaveTextContent("B");
  });

  it("読み込みに失敗するとエラーが表示される", async () => {
    vi.mocked(commands.listSourceFiles).mockRejectedValue(
      new Error("Directory not found"),
    );
    renderPanel();

    await userEvent.click(screen.getByTestId("auto-classify-load-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("auto-classify-load-error")).toBeInTheDocument();
    });
    expect(screen.getByTestId("auto-classify-load-error")).toHaveTextContent(
      "読み込みエラー",
    );
  });
});
