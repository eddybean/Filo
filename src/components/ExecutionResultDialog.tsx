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
    <div data-testid="result-dialog" className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">{t("result.title")}</h2>
        </div>

        <div className="p-4 space-y-6">
          {results.map((result) => (
            <SingleResult key={result.ruleset_id} result={result} />
          ))}
        </div>

        <div className="flex justify-end p-4 border-t">
          <button
            data-testid="btn-result-close"
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
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
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="font-medium">{result.ruleset_name}</span>
          <span className="text-xs text-gray-500 ml-2">
            {actionLabel} | {statusLabel}
          </span>
        </div>
        {isMove && result.succeeded.length > 0 && (
          <button
            data-testid="btn-undo-all"
            onClick={handleUndoAll}
            className="text-xs px-2 py-1 border border-orange-300 text-orange-600 rounded hover:bg-orange-50"
          >
            {t("result.undoAll")}
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm mb-2">
        <span className="text-green-600">
          ✓ {t("result.succeeded")}:{" "}
          {t("result.items", { count: result.succeeded.length })}
        </span>
        <span className="text-yellow-600">
          ⚠ {t("result.skipped")}: {t("result.items", { count: result.skipped.length })}
        </span>
        <span className="text-red-600">
          ✗ {t("result.errors")}: {t("result.items", { count: result.errors.length })}
        </span>
      </div>

      {/* Detail list */}
      <div className="border rounded divide-y text-xs">
        {result.succeeded.map((file) => {
          const status = undoStatuses[file.source_path];
          return (
            <div key={file.source_path} className="flex items-center gap-2 px-3 py-2">
              {status === "undone" ? (
                <span className="text-orange-500">↩</span>
              ) : (
                <span className="text-green-500">✓</span>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {status === "undone" ? t("result.undone") : file.filename}
                </div>
                {status !== "undone" && (
                  <div className="text-gray-400 truncate">
                    {file.source_path} → {file.destination_path}
                  </div>
                )}
              </div>
              {isMove && status !== "undone" && (
                <button
                  onClick={() => handleUndoFile(file)}
                  className="text-orange-500 hover:text-orange-700 whitespace-nowrap"
                >
                  ↩ {t("result.undoFile")}
                </button>
              )}
              {status === "error" && (
                <span className="text-red-500">{t("result.undoError")}</span>
              )}
            </div>
          );
        })}

        {result.skipped.map((file) => (
          <div key={file.source_path} className="flex items-center gap-2 px-3 py-2">
            <span className="text-yellow-500">⚠</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{file.filename}</div>
              <div className="text-gray-400 truncate">
                {file.reason ?? t("result.skipReason")}
              </div>
            </div>
          </div>
        ))}

        {result.errors.map((file) => (
          <div key={file.source_path} className="flex items-center gap-2 px-3 py-2">
            <span className="text-red-500">✗</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{file.filename}</div>
              <div className="text-red-400 truncate">{file.reason}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
