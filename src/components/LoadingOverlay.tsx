import { useTranslation } from "react-i18next";

interface LoadingOverlayProps {
  currentFile: string | null;
  currentRuleset: string | null;
}

export function LoadingOverlay({ currentFile, currentRuleset }: LoadingOverlayProps) {
  const { t } = useTranslation();

  return (
    <div
      data-testid="loading-overlay"
      className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm"
    >
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-slate-200 dark:border-slate-700/60">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {t("execution.processing")}
          </p>
          {currentFile && currentRuleset && (
            <p className="text-xs text-slate-500 dark:text-slate-500 text-center break-all">
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
