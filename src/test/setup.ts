import "@testing-library/jest-dom/vitest";
import { clearMocks } from "@tauri-apps/api/mocks";
import i18n from "../lib/i18n";

// i18n を日本語に固定（翻訳テキストを確定させる）
// globals: true のため beforeAll/afterEach はインポート不要
beforeAll(async () => {
  await i18n.changeLanguage("ja");
});

// 各テスト後に IPC モックをリセット
afterEach(() => {
  clearMocks();
});
