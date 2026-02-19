import { useTranslation } from "react-i18next";
import type { Ruleset } from "../lib/types";

interface RulesetCardProps {
  ruleset: Ruleset;
  index: number;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onExecute: (id: string) => void;
  onEdit: (ruleset: Ruleset) => void;
  onDelete: (id: string) => void;
  executing: boolean;
}

export function RulesetCard({
  ruleset,
  index,
  onToggleEnabled,
  onExecute,
  onEdit,
  onDelete,
  executing,
}: RulesetCardProps) {
  const { t } = useTranslation();

  const actionLabel = ruleset.action === "move" ? t("ruleset.move") : t("ruleset.copy");

  const filterSummary = buildFilterSummary(ruleset);

  return (
    <div
      data-testid="ruleset-card"
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-150 ${
        ruleset.enabled
          ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700/60 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600"
          : "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 opacity-50"
      }`}
    >
      <input
        data-testid="ruleset-toggle"
        type="checkbox"
        checked={ruleset.enabled}
        onChange={(e) => onToggleEnabled(ruleset.id, e.target.checked)}
        className="w-4 h-4 accent-blue-600 dark:accent-blue-400 cursor-pointer flex-shrink-0"
      />

      <span className="text-slate-300 dark:text-slate-600 text-xs w-5 text-center flex-shrink-0 font-mono">
        {index + 1}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            data-testid="ruleset-name"
            className="font-medium text-sm text-slate-800 dark:text-slate-100 truncate"
          >
            {ruleset.name}
          </span>
          <span
            data-testid="ruleset-action-badge"
            className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
              ruleset.action === "move"
                ? "bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
                : "bg-violet-50 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400"
            }`}
          >
            {actionLabel}
          </span>
        </div>
        <div className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
          {ruleset.source_dir}
          <span className="mx-1 text-slate-300 dark:text-slate-600">→</span>
          {ruleset.destination_dir}
        </div>
        {filterSummary && (
          <div className="text-xs text-slate-400 dark:text-slate-600 truncate mt-0.5 font-mono">
            {filterSummary}
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          data-testid="ruleset-execute"
          onClick={() => onExecute(ruleset.id)}
          disabled={executing}
          title={t("ruleset.execute")}
          className="p-1.5 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 3l14 9-14 9V3z" />
          </svg>
        </button>
        <button
          data-testid="ruleset-edit"
          onClick={() => onEdit(ruleset)}
          title={t("ruleset.edit")}
          className="p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors duration-150"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button
          data-testid="ruleset-delete"
          onClick={() => onDelete(ruleset.id)}
          title={t("ruleset.delete")}
          className="p-1.5 text-slate-400 dark:text-slate-500 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 dark:hover:text-red-400 rounded-md transition-colors duration-150"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

function buildFilterSummary(ruleset: Ruleset): string {
  const parts: string[] = [];
  const { filters } = ruleset;

  if (filters.extensions && filters.extensions.length > 0) {
    parts.push(filters.extensions.join(", "));
  }

  if (filters.filename) {
    const type = filters.filename.match_type === "glob" ? "glob" : "regex";
    parts.push(`${type}: ${filters.filename.pattern}`);
  }

  return parts.join(" | ");
}
