import { useTranslation } from "react-i18next";

interface ToolbarProps {
  onCreateNew: () => void;
  onExecuteAll: () => void;
  onImport: () => void;
  onExport: () => void;
  executing: boolean;
}

export function Toolbar({
  onCreateNew,
  onExecuteAll,
  onImport,
  onExport,
  executing,
}: ToolbarProps) {
  const { t } = useTranslation();

  return (
    <div data-testid="toolbar" className="flex items-center gap-2 p-3 border-b border-gray-200 bg-white">
      <button
        data-testid="toolbar-create"
        onClick={onCreateNew}
        className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
      >
        + {t("toolbar.create")}
      </button>
      <button
        data-testid="toolbar-execute-all"
        onClick={onExecuteAll}
        disabled={executing}
        className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
      >
        {t("toolbar.executeAll")}
      </button>
      <div className="flex-1" />
      <button
        data-testid="toolbar-import"
        onClick={onImport}
        className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-sm"
      >
        {t("toolbar.import")}
      </button>
      <button
        data-testid="toolbar-export"
        onClick={onExport}
        className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-sm"
      >
        {t("toolbar.export")}
      </button>
    </div>
  );
}
