import { useState } from "react";
import { useTranslation } from "react-i18next";

interface LoadingOverlayProps {
  currentFile: string | null;
  currentRuleset: string | null;
  progress: {
    current: number;
    total: number;
    bytesPerSecond: number;
  } | null;
  onCancel: () => Promise<void>;
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
  } else if (bytesPerSecond >= 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  } else {
    return `${Math.round(bytesPerSecond)} B/s`;
  }
}

export function LoadingOverlay({
  currentFile,
  currentRuleset,
  progress,
  onCancel,
}: LoadingOverlayProps) {
  const { t } = useTranslation();
  const [cancelling, setCancelling] = useState(false);

  const percent =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  async function handleCancel() {
    if (cancelling) return;
    setCancelling(true);
    try {
      await onCancel();
    } finally {
      setCancelling(false);
    }
  }

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

          {progress && progress.total > 0 && (
            <div className="w-full flex flex-col gap-2">
              {/* Progress bar */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-500 dark:bg-blue-400 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>

              {/* Progress numbers and speed */}
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {t("execution.progress", {
                    current: progress.current,
                    total: progress.total,
                  })}
                </span>
                <span className="font-medium tabular-nums">
                  {percent}%
                  {progress.bytesPerSecond > 0 && (
                    <span className="ml-2 text-slate-400 dark:text-slate-500">
                      {t("execution.speed", {
                        speed: formatSpeed(progress.bytesPerSecond),
                      })}
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Cancel button */}
          <button
            data-testid="btn-cancel-execution"
            onClick={handleCancel}
            disabled={cancelling}
            className="mt-1 px-4 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-slate-300 dark:disabled:hover:border-slate-600"
          >
            {t("execution.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
