import { useTranslation } from "react-i18next";

interface LoadingOverlayProps {
  currentFile: string | null;
  currentRuleset: string | null;
}

export function LoadingOverlay({ currentFile, currentRuleset }: LoadingOverlayProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm font-medium text-gray-700">{t("execution.processing")}</p>
          {currentFile && currentRuleset && (
            <p className="text-xs text-gray-500 text-center break-all">
              {t("execution.processingFile", {
                ruleset: currentRuleset,
                file: currentFile,
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
