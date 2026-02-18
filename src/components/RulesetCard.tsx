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
      className={`flex items-center gap-3 p-3 border rounded-lg ${
        ruleset.enabled
          ? "bg-white border-gray-200"
          : "bg-gray-50 border-gray-100 opacity-60"
      }`}
    >
      <input
        type="checkbox"
        checked={ruleset.enabled}
        onChange={(e) => onToggleEnabled(ruleset.id, e.target.checked)}
        className="w-4 h-4"
      />

      <span className="text-gray-400 text-sm w-6 text-center">{index + 1}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{ruleset.name}</span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              ruleset.action === "move"
                ? "bg-blue-100 text-blue-700"
                : "bg-purple-100 text-purple-700"
            }`}
          >
            {actionLabel}
          </span>
        </div>
        <div className="text-xs text-gray-500 truncate mt-0.5">
          {ruleset.source_dir} → {ruleset.destination_dir}
        </div>
        {filterSummary && (
          <div className="text-xs text-gray-400 truncate mt-0.5">{filterSummary}</div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onExecute(ruleset.id)}
          disabled={executing}
          className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
          title={t("ruleset.execute")}
        >
          ▶
        </button>
        <button
          onClick={() => onEdit(ruleset)}
          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
          title={t("ruleset.edit")}
        >
          ✎
        </button>
        <button
          onClick={() => onDelete(ruleset.id)}
          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
          title={t("ruleset.delete")}
        >
          🗑
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
