import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ExecutionResult, FileResult } from "../lib/types";
import * as commands from "../lib/commands";

interface ExecutionResultDialogProps {
  results: ExecutionResult[];
  onClose: () => void;
}

type UndoStatus = "pending" | "undone" | "error";

export function ExecutionResultDialog({ results, onClose }: ExecutionResultDialogProps) {
  const { t } = useTranslation();

  return (
    <div
      data-testid="result-dialog"
      className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 backdrop-blur-[6px]"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.25),0_8px_16px_rgba(0,0,0,0.10)] w-full max-w-2xl max-h-[80vh] overflow-y-auto border border-slate-200 dark:border-slate-700/60">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t("result.title")}
          </h2>
        </div>

        <div className="px-5 py-4 space-y-6">
          {results.map((result) => (
            <SingleResult key={result.ruleset_id} result={result} />
          ))}
        </div>

        <div className="flex justify-end px-5 py-4 border-t border-slate-200 dark:border-slate-800">
          <button
            data-testid="btn-result-close"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {t("result.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function SingleResult({ result }: { result: ExecutionResult }) {
  const { t } = useTranslation();
  const [undoStatuses, setUndoStatuses] = useState<Record<string, UndoStatus>>({});

  const isMove = result.action === "move";

  async function handleUndoFile(file: FileResult) {
    if (!file.destination_path) return;
    const key = file.source_path;
    try {
      await commands.undoFile(file.source_path, file.destination_path);
      setUndoStatuses((prev) => ({ ...prev, [key]: "undone" }));
    } catch {
      setUndoStatuses((prev) => ({ ...prev, [key]: "error" }));
    }
  }

  async function handleUndoAll() {
    for (const file of result.succeeded) {
      if (file.destination_path && undoStatuses[file.source_path] !== "undone") {
        await handleUndoFile(file);
      }
    }
  }

  const statusLabel = {
    Completed: t("result.statusCompleted"),
    PartialFailure: t("result.statusPartialFailure"),
    Failed: t("result.statusFailed"),
  }[result.status];

  const actionLabel = result.action === "move" ? t("ruleset.move") : t("ruleset.copy");

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="font-medium text-slate-900 dark:text-slate-100">
            {result.ruleset_name}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
            {actionLabel} | {statusLabel}
          </span>
        </div>
        {isMove && result.succeeded.length > 0 && (
          <button
            data-testid="btn-undo-all"
            onClick={handleUndoAll}
            className="text-xs px-2.5 py-1 border border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
          >
            {t("result.undoAll")}
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm mb-3">
        <span className="text-emerald-600 dark:text-emerald-400">
          ✓ {t("result.succeeded")}:{" "}
          <span className="font-semibold">
            {t("result.items", { count: result.succeeded.length })}
          </span>
        </span>
        <span className="text-amber-600 dark:text-amber-400">
          ⚠ {t("result.skipped")}:{" "}
          <span className="font-semibold">
            {t("result.items", { count: result.skipped.length })}
          </span>
        </span>
        <span className="text-red-600 dark:text-red-400">
          ✗ {t("result.errors")}:{" "}
          <span className="font-semibold">
            {t("result.items", { count: result.errors.length })}
          </span>
        </span>
      </div>

      {/* Detail list */}
      <div className="border border-slate-200 dark:border-slate-700/60 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 text-xs overflow-hidden">
        {result.succeeded.map((file) => {
          const status = undoStatuses[file.source_path];
          return (
            <div
              key={file.source_path}
              className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900"
            >
              {status === "undone" ? (
                <span className="text-amber-500">↩</span>
              ) : (
                <span className="text-emerald-500">✓</span>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                  {status === "undone" ? t("result.undone") : file.filename}
                </div>
                {status !== "undone" && (
                  <div className="text-slate-400 dark:text-slate-600 truncate font-mono">
                    {file.source_path} → {file.destination_path}
                  </div>
                )}
              </div>
              {isMove && status !== "undone" && (
                <button
                  onClick={() => handleUndoFile(file)}
                  className="text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 whitespace-nowrap transition-colors"
                >
                  ↩ {t("result.undoFile")}
                </button>
              )}
              {status === "error" && (
                <span className="text-red-500 dark:text-red-400">
                  {t("result.undoError")}
                </span>
              )}
            </div>
          );
        })}

        {result.skipped.map((file) => (
          <div
            key={file.source_path}
            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900"
          >
            <span className="text-amber-500">⚠</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                {file.filename}
              </div>
              <div className="text-slate-400 dark:text-slate-600 truncate">
                {file.reason ?? t("result.skipReason")}
              </div>
            </div>
          </div>
        ))}

        {result.errors.map((file) => (
          <div
            key={file.source_path}
            className="flex items-center gap-2 px-3 py-2 bg-red-50/50 dark:bg-red-900/10"
          >
            <span className="text-red-500">✗</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                {file.filename}
              </div>
              <div className="text-red-500 dark:text-red-400 truncate">{file.reason}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
