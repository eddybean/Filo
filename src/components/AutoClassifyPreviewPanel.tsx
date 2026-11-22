import { useState } from "react";
import { useTranslation } from "react-i18next";
import { listSourceFiles, previewAutoClassify } from "../lib/commands";
import type { ClassifyPreview } from "../lib/types";

interface AutoClassifyPreviewPanelProps {
  sourceDir: string;
  destinationDir: string;
  /** 拡張子フィルタ。指定があれば一致するファイルだけを判定する */
  extensions: string[] | null;
}

const AMBIGUOUS_RE = /^Auto-classify: ambiguous between '(.*)' and '(.*)'$/;
const NO_SUBFOLDERS = "Auto-classify: destination has no subfolders";
const NO_MATCH = "Auto-classify: no matching folder";

function matchesExtensions(filename: string, extensions: string[] | null): boolean {
  if (!extensions || extensions.length === 0) return true;
  const lower = filename.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext.toLowerCase()));
}

export function AutoClassifyPreviewPanel({
  sourceDir,
  destinationDir,
  extensions,
}: AutoClassifyPreviewPanelProps) {
  const { t } = useTranslation();
  const [results, setResults] = useState<ClassifyPreview[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function handleLoad() {
    if (!sourceDir || !destinationDir) return;
    setIsLoading(true);
    setLoadError(null);
    setResults(null);
    try {
      const files = (await listSourceFiles(sourceDir)).filter((f) =>
        matchesExtensions(f, extensions),
      );
      setResults(await previewAutoClassify(destinationDir, files));
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setIsLoading(false);
    }
  }

  function describeReason(reason: string | null): string {
    if (!reason || reason === NO_MATCH) return t("editor.autoClassifyPreview.noMatch");
    if (reason === NO_SUBFOLDERS) return t("editor.autoClassifyPreview.noSubfolders");
    const m = AMBIGUOUS_RE.exec(reason);
    if (m) return t("editor.autoClassifyPreview.ambiguous", { a: m[1], b: m[2] });
    return reason;
  }

  const matchedCount = results?.filter((r) => r.folder !== null).length ?? 0;

  return (
    <div
      data-testid="auto-classify-preview-panel"
      className="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs"
    >
      <div className="px-3 py-2.5">
        <p className="text-slate-500 dark:text-slate-400 mb-2">
          {t("editor.autoClassifyHint")}
        </p>
        <button
          data-testid="auto-classify-load-btn"
          onClick={handleLoad}
          disabled={isLoading || !sourceDir || !destinationDir}
          className="px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {t("editor.autoClassifyPreview.loadFiles")}
        </button>

        {loadError && (
          <p
            data-testid="auto-classify-load-error"
            className="mt-1.5 text-red-500 dark:text-red-400"
          >
            {t("editor.autoClassifyPreview.loadError", { message: loadError })}
          </p>
        )}

        {results && (
          <div className="mt-2" data-testid="auto-classify-result-list">
            <p
              data-testid="auto-classify-match-count"
              className="mb-1.5 text-slate-500 dark:text-slate-400"
            >
              {t("editor.autoClassifyPreview.matchCount", {
                matched: matchedCount,
                total: results.length,
              })}
            </p>
            {results.length === 0 ? (
              <p className="text-slate-400 dark:text-slate-500">
                {t("editor.autoClassifyPreview.empty")}
              </p>
            ) : (
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {results.map((r) => (
                  <div
                    key={r.filename}
                    data-testid="auto-classify-row"
                    className="flex items-start gap-1.5 font-mono"
                  >
                    <span
                      className={`flex-none ${
                        r.folder
                          ? "text-green-500 dark:text-green-400"
                          : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {r.folder ? "✓" : "–"}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300 break-all">
                      {r.filename}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600 flex-none">
                      →
                    </span>
                    {r.folder ? (
                      <span className="text-slate-600 dark:text-slate-300 break-all">
                        {r.folder}/
                        <span className="ml-1 text-slate-400 dark:text-slate-500">
                          ({r.score.toFixed(2)})
                        </span>
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 break-all">
                        {describeReason(r.reason)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
