import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegexTesterPanel } from "./RegexTesterPanel";
import { renderWithProviders } from "../test/helpers/renderWithProviders";

vi.mock("../lib/commands", () => ({
  listSourceFiles: vi.fn(),
}));

import * as commands from "../lib/commands";

function renderPanel(props?: Partial<Parameters<typeof RegexTesterPanel>[0]>) {
  renderWithProviders(
    <RegexTesterPanel pattern="" sourceDir="" destinationDir="" {...props} />,
  );
}

describe("RegexTesterPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("パターンが空のときは結果が表示されない", () => {
    renderPanel({ pattern: "" });
    expect(screen.queryByTestId("regex-match-result")).not.toBeInTheDocument();
  });

  it("無効な正規表現のとき構文エラーが表示される", () => {
    renderPanel({ pattern: "[invalid" });
    expect(screen.getByTestId("regex-syntax-error")).toBeInTheDocument();
    expect(screen.getByTestId("regex-syntax-error")).toHaveTextContent("構文エラー");
  });

  it("サンプルファイル名がマッチするとき「マッチしました」が表示される", async () => {
    renderPanel({ pattern: "^IMG_\\d+\\.jpg$" });
    await userEvent.type(screen.getByTestId("regex-sample-input"), "IMG_001.jpg");
    await waitFor(() => {
      expect(screen.getByTestId("regex-match-result")).toHaveTextContent(
        "マッチしました",
      );
    });
  });

  it("サンプルファイル名がマッチしないとき「マッチしません」が表示される", async () => {
    renderPanel({ pattern: "^IMG_\\d+\\.jpg$" });
    await userEvent.type(screen.getByTestId("regex-sample-input"), "document.pdf");
    await waitFor(() => {
      expect(screen.getByTestId("regex-match-result")).toHaveTextContent(
        "マッチしません",
      );
    });
  });

  it("名前付きキャプチャグループがあるときグループ名と値が表示される", async () => {
    renderPanel({ pattern: "^(?P<date>\\d{8})_(?P<num>\\d+)\\.jpg$" });
    await userEvent.type(screen.getByTestId("regex-sample-input"), "20250101_001.jpg");
    await waitFor(() => {
      expect(screen.getByTestId("regex-capture-groups")).toBeInTheDocument();
    });
    expect(screen.getByTestId("regex-capture-groups")).toHaveTextContent("date");
    expect(screen.getByTestId("regex-capture-groups")).toHaveTextContent("20250101");
    expect(screen.getByTestId("regex-capture-groups")).toHaveTextContent("num");
    expect(screen.getByTestId("regex-capture-groups")).toHaveTextContent("001");
  });

  it("[^]] 構文 (Rust で ] を negated class の先頭に置く書き方) が正しくマッチする", async () => {
    // [^\[]*\[(?P<author>[^]]*)\] にて [john]title.txt がマッチすること
    // Rust regex では [^]] = "not ]" だが JS では [^] = "any char" になるため変換が必要
    renderPanel({
      pattern: String.raw`[^\[]*\[(?P<author>[^]]*)\]`,
    });
    // userEvent.type は "[" を modifier key として解釈するため fireEvent.change を使用
    fireEvent.change(screen.getByTestId("regex-sample-input"), {
      target: { value: "[john]title.txt" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("regex-match-result")).toHaveTextContent(
        "マッチしました",
      );
    });
    expect(screen.getByTestId("regex-capture-groups")).toHaveTextContent("author");
    expect(screen.getByTestId("regex-capture-groups")).toHaveTextContent("john");
  });

  it("Rust の (?P<name>...) 構文でもキャプチャグループが動作する", async () => {
    renderPanel({
      pattern: String.raw`^\((?P<label>[^)]+)\) .+`,
    });
    await userEvent.type(screen.getByTestId("regex-sample-input"), "(book) ihavepen.zip");
    await waitFor(() => {
      expect(screen.getByTestId("regex-match-result")).toHaveTextContent(
        "マッチしました",
      );
    });
    expect(screen.getByTestId("regex-capture-groups")).toHaveTextContent("label");
    expect(screen.getByTestId("regex-capture-groups")).toHaveTextContent("book");
  });

  it("destinationDir にテンプレート変数があるとき解決後のパスが表示される", async () => {
    renderPanel({
      pattern: "^(?P<date>\\d{8})_(?P<num>\\d+)\\.jpg$",
      destinationDir: "C:/sorted/{date}/{num}",
    });
    await userEvent.type(screen.getByTestId("regex-sample-input"), "20250101_001.jpg");
    await waitFor(() => {
      expect(screen.getByTestId("regex-resolved-path")).toBeInTheDocument();
    });
    expect(screen.getByTestId("regex-resolved-path")).toHaveTextContent(
      "C:/sorted/20250101/001",
    );
  });

  it("sourceDir が空のときソースフォルダ読み込みボタンが表示されない", () => {
    renderPanel({ sourceDir: "" });
    expect(screen.queryByTestId("regex-load-files-btn")).not.toBeInTheDocument();
  });

  it("sourceDir があるときソースフォルダ読み込みボタンが表示される", () => {
    renderPanel({ sourceDir: "C:/test/src" });
    expect(screen.getByTestId("regex-load-files-btn")).toBeInTheDocument();
  });

  it("ソースフォルダ読み込みボタンをクリックするとマッチしたファイル一覧が表示される", async () => {
    vi.mocked(commands.listSourceFiles).mockResolvedValue([
      "IMG_20250101_001.jpg",
      "document.pdf",
    ]);
    renderPanel({
      pattern: "^IMG_\\d{8}_\\d+\\.jpg$",
      sourceDir: "C:/test/src",
    });
    await userEvent.click(screen.getByTestId("regex-load-files-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("regex-file-list")).toBeInTheDocument();
    });
    // マッチしたファイルのみ表示される
    expect(screen.getByTestId("regex-file-list")).toHaveTextContent(
      "IMG_20250101_001.jpg",
    );
    // 非マッチのファイルは表示されない
    expect(screen.getByTestId("regex-file-list")).not.toHaveTextContent("document.pdf");
  });

  it("ファイル一覧でマッチするファイルとマッチしないファイルが区別される", async () => {
    vi.mocked(commands.listSourceFiles).mockResolvedValue([
      "IMG_20250101_001.jpg",
      "document.pdf",
    ]);
    renderPanel({
      pattern: "^IMG_\\d{8}_\\d+\\.jpg$",
      sourceDir: "C:/test/src",
    });
    await userEvent.click(screen.getByTestId("regex-load-files-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("regex-file-list")).toBeInTheDocument();
    });
    // マッチ数サマリーが表示される
    expect(screen.getByTestId("regex-match-count")).toHaveTextContent("1 / 2");
  });

  it("ソースフォルダの読み込みに失敗するとエラーが表示される", async () => {
    vi.mocked(commands.listSourceFiles).mockRejectedValue(
      new Error("Directory not found"),
    );
    renderPanel({ sourceDir: "C:/nonexistent" });
    await userEvent.click(screen.getByTestId("regex-load-files-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("regex-load-error")).toBeInTheDocument();
    });
    expect(screen.getByTestId("regex-load-error")).toHaveTextContent("読み込みエラー");
  });
});
