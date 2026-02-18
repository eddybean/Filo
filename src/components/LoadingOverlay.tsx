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
      className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 backdrop-blur-[6px]"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.25),0_8px_16px_rgba(0,0,0,0.10)] p-6 max-w-sm w-full mx-4 border border-slate-200 dark:border-slate-700/60">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-blue-100 dark:border-blue-900/40" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 dark:border-t-blue-400 animate-spin" />
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
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
