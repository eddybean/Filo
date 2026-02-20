import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { open, save, confirm } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Toolbar } from "./components/Toolbar";
import { RulesetList } from "./components/RulesetList";
import { RulesetEditDialog } from "./components/RulesetEditDialog";
import { ExecutionResultDialog } from "./components/ExecutionResultDialog";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { useRulesetStore } from "./store/rulesetStore";
import type { Ruleset, ExecutionResult } from "./lib/types";
import * as commands from "./lib/commands";

function App() {
  const { t } = useTranslation();
  const {
    rulesets,
    error: storeError,
    fetchRulesets,
    saveRuleset,
    deleteRuleset,
    duplicateRuleset,
    reorderRulesets,
    executeRuleset,
    executeAll,
  } = useRulesetStore();

  const [editingRuleset, setEditingRuleset] = useState<Ruleset | null | undefined>(
    undefined, // undefined = closed, null = new, Ruleset = editing
  );
  const [executionResults, setExecutionResults] = useState<ExecutionResult[] | null>(
    null,
  );
  const [executing, setExecuting] = useState(false);
  const [executingFile, setExecutingFile] = useState<string | null>(null);
  const [executingRuleset, setExecutingRuleset] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem("filo-dark") === "true";
  });

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem("filo-dark", String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    fetchRulesets();
  }, [fetchRulesets]);

  useEffect(() => {
    const unlisten = listen<{ ruleset_name: string; filename: string }>(
      "execution-progress",
      (event) => {
        setExecutingRuleset(event.payload.ruleset_name);
        setExecutingFile(event.payload.filename);
      },
    );
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!executing) return;

    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let mounted = true;

    appWindow
      .onCloseRequested(async (event) => {
        event.preventDefault();
        const ok = await confirm(t("execution.closeWarning"), { kind: "warning" });
        if (ok) {
          await appWindow.destroy();
        }
      })
      .then((fn) => {
        if (mounted) unlisten = fn;
        else fn();
      });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [executing, t]);

  const handleToggleEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      const rs = rulesets.find((r) => r.id === id);
      if (rs) {
        await saveRuleset({ ...rs, enabled });
      }
    },
    [rulesets, saveRuleset],
  );

  const handleExecute = useCallback(
    async (id: string) => {
      setExecuting(true);
      setExecutingFile(null);
      setExecutingRuleset(null);
      try {
        const result = await executeRuleset(id);
        setExecutionResults([result]);
      } finally {
        setExecuting(false);
        setExecutingFile(null);
        setExecutingRuleset(null);
      }
    },
    [executeRuleset],
  );

  const handleExecuteAll = useCallback(async () => {
    setExecuting(true);
    setExecutingFile(null);
    setExecutingRuleset(null);
    try {
      const results = await executeAll();
      if (results.length > 0) {
        setExecutionResults(results);
      }
    } finally {
      setExecuting(false);
      setExecutingFile(null);
      setExecutingRuleset(null);
    }
  }, [executeAll]);

  const handleDelete = useCallback(
    async (id: string) => {
      const rs = rulesets.find((r) => r.id === id);
      const message = t("ruleset.deleteConfirm", { name: rs?.name ?? id });
      const ok = await confirm(message);
      if (ok) {
        await deleteRuleset(id);
      }
    },
    [rulesets, deleteRuleset, t],
  );

  const handleSaveRuleset = useCallback(
    async (ruleset: Ruleset) => {
      await saveRuleset(ruleset);
      setEditingRuleset(undefined);
    },
    [saveRuleset],
  );

  const handleSelectFolder = useCallback(async (): Promise<string | null> => {
    const selected = await open({ directory: true });
    return selected ?? null;
  }, []);

  const handleImport = useCallback(async () => {
    const path = await open({
      filters: [{ name: "YAML", extensions: ["yaml", "yml"] }],
    });
    if (path) {
      const imported = await commands.importRulesets(path);
      for (const rs of imported) {
        await saveRuleset(rs);
      }
    }
  }, [saveRuleset]);

  const handleExport = useCallback(async () => {
    const path = await save({
      defaultPath: "filo-rules.yaml",
      filters: [{ name: "YAML", extensions: ["yaml", "yml"] }],
    });
    if (path) {
      await commands.exportRulesets(path);
    }
  }, []);

  const enabledCount = rulesets.filter((r) => r.enabled).length;

  return (
    <main
      className={`flex flex-col h-screen bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-950 dark:to-[#0f1117] text-slate-900 dark:text-slate-100 transition-colors duration-200${darkMode ? " dark" : ""}`}
    >
      <Toolbar
        onCreateNew={() => setEditingRuleset(null)}
        onExecuteAll={handleExecuteAll}
        onImport={handleImport}
        onExport={handleExport}
        executing={executing}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      <div className="flex-1 overflow-y-auto">
        {rulesets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400 dark:text-slate-600">
            <div className="text-5xl opacity-30 select-none">📂</div>
            <p className="text-sm font-medium">{t("toolbar.create")}</p>
          </div>
        ) : (
          <RulesetList
            rulesets={rulesets}
            onToggleEnabled={handleToggleEnabled}
            onExecute={handleExecute}
            onEdit={(rs) => setEditingRuleset(rs)}
            onDelete={handleDelete}
            onDuplicate={duplicateRuleset}
            onReorder={reorderRulesets}
            executing={executing}
          />
        )}
      </div>

      {storeError && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800/60 text-xs text-red-700 dark:text-red-400">
          {storeError}
        </div>
      )}

      <div className="px-4 py-2 border-t border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm text-xs text-slate-500 dark:text-slate-500">
        {t("app.statusBar", { total: rulesets.length, enabled: enabledCount })}
      </div>

      {editingRuleset !== undefined && (
        <RulesetEditDialog
          ruleset={editingRuleset}
          onSave={handleSaveRuleset}
          onCancel={() => setEditingRuleset(undefined)}
          onSelectFolder={handleSelectFolder}
        />
      )}

      {executionResults && (
        <ExecutionResultDialog
          results={executionResults}
          onClose={() => setExecutionResults(null)}
        />
      )}

      {executing && (
        <LoadingOverlay currentFile={executingFile} currentRuleset={executingRuleset} />
      )}
    </main>
  );
}

export default App;
