import { useTranslation } from "react-i18next";

interface ToolbarProps {
  onCreateNew: () => void;
  onExecuteAll: () => void;
  onImport: () => void;
  onExport: () => void;
  executing: boolean;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
}

export function Toolbar({
  onCreateNew,
  onExecuteAll,
  onImport,
  onExport,
  executing,
  darkMode,
  onToggleDarkMode,
}: ToolbarProps) {
  const { t } = useTranslation();

  return (
    <div
      data-testid="toolbar"
      className="flex items-center gap-2 px-4 py-3 border-b border-slate-200/70 dark:border-slate-800/60 bg-white/85 backdrop-blur-xl backdrop-saturate-180 dark:bg-slate-900/85 shadow-sm"
    >
      <span className="text-sm font-bold tracking-wide bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent mr-1 select-none">
        Filo
      </span>

      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />

      <button
        data-testid="toolbar-create"
        onClick={onCreateNew}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 dark:from-blue-500 dark:to-blue-600 dark:hover:from-blue-400 dark:hover:to-blue-500 text-white rounded-lg text-sm font-medium transition-all duration-150 shadow-sm shadow-blue-500/20"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M12 4v16m8-8H4"
          />
        </svg>
        {t("toolbar.create")}
      </button>

      <button
        data-testid="toolbar-execute-all"
        onClick={onExecuteAll}
        disabled={executing}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 dark:from-emerald-500 dark:to-emerald-600 dark:hover:from-emerald-400 dark:hover:to-emerald-500 text-white rounded-lg text-sm font-medium transition-all duration-150 shadow-sm shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M5 3l14 9-14 9V3z"
          />
        </svg>
        {t("toolbar.executeAll")}
      </button>

      <div className="flex-1" />

      <button
        data-testid="toolbar-import"
        onClick={onImport}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-sm text-slate-600 dark:text-slate-300 transition-colors duration-150"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
        {t("toolbar.import")}
      </button>

      <button
        data-testid="toolbar-export"
        onClick={onExport}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-sm text-slate-600 dark:text-slate-300 transition-colors duration-150"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        {t("toolbar.export")}
      </button>

      {onToggleDarkMode && (
        <button
          onClick={onToggleDarkMode}
          title={darkMode ? "ライトモードに切り替え" : "ダークモードに切り替え"}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors duration-150"
        >
          {darkMode ? (
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M18.364 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
