import { render, type RenderResult } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "../../lib/i18n";

export function renderWithProviders(ui: React.ReactElement): RenderResult {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}
