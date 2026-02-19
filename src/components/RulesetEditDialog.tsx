import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { Ruleset, Action, MatchType, Filters } from "../lib/types";

interface RulesetEditDialogProps {
  ruleset: Ruleset | null; // null = create new
  onSave: (ruleset: Ruleset) => Promise<void>;
  onCancel: () => void;
  onSelectFolder: () => Promise<string | null>;
}

function emptyRuleset(): Ruleset {
  return {
    id: "",
    name: "",
    enabled: true,
    source_dir: "",
    destination_dir: "",
    action: "move",
    overwrite: false,
    filters: {
      extensions: null,
      filename: null,
      created_at: null,
      modified_at: null,
    },
  };
}

export function RulesetEditDialog({
  ruleset,
  onSave,
  onCancel,
  onSelectFolder,
}: RulesetEditDialogProps) {
  const { t } = useTranslation();
  const isNew = !ruleset;
  const initialForm = useRef<Ruleset>(ruleset ?? emptyRuleset());
  const [form, setForm] = useState<Ruleset>(ruleset ?? emptyRuleset());
  const [extensionInput, setExtensionInput] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  function updateField<K extends keyof Ruleset>(key: K, value: Ruleset[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateFilters(updates: Partial<Filters>) {
    setForm((prev) => ({
      ...prev,
      filters: { ...prev.filters, ...updates },
    }));
  }

  function addExtension() {
    const ext = extensionInput.trim();
    if (!ext) return;
    const normalized = ext.startsWith(".") ? ext : `.${ext}`;
    const current = form.filters.extensions ?? [];
    if (!current.includes(normalized)) {
      updateFilters({ extensions: [...current, normalized] });
    }
    setExtensionInput("");
  }

  function removeExtension(ext: string) {
    const current = form.filters.extensions ?? [];
    const updated = current.filter((e) => e !== ext);
    updateFilters({ extensions: updated.length > 0 ? updated : null });
  }

  function validate(): boolean {
    const errs: string[] = [];
    if (!form.name.trim()) errs.push(t("editor.validation.nameRequired"));
    if (!form.source_dir) errs.push(t("editor.validation.sourceDirRequired"));
    if (!form.destination_dir) errs.push(t("editor.validation.destinationDirRequired"));

    const f = form.filters;
    const hasFilter =
      (f.extensions && f.extensions.length > 0) ||
      f.filename ||
      f.created_at ||
      f.modified_at;
    if (!hasFilter) errs.push(t("editor.validation.filterRequired"));

    setErrors(errs);
    return errs.length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    try {
      await onSave(form);
    } catch (e) {
      setErrors([String(e)]);
    }
  }

  function hasChanges(): boolean {
    return JSON.stringify(form) !== JSON.stringify(initialForm.current);
  }

  async function handleClose() {
    if (hasChanges()) {
      const ok = await confirm(t("editor.discardConfirm"));
      if (!ok) return;
    }
    onCancel();
  }

  async function selectSource() {
    const path = await onSelectFolder();
    if (path) updateField("source_dir", path);
  }

  async function selectDest() {
    const path = await onSelectFolder();
    if (path) updateField("destination_dir", path);
  }

  const inputClass =
    "w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-blue-400/40 focus:border-blue-400 dark:focus:border-blue-500 transition-colors";

  const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";
  const labelXsClass =
    "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1";

  return (
    <div
      data-testid="edit-dialog"
      className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm"
    >
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700/60">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {isNew ? t("editor.titleCreate") : t("editor.title")}
          </h2>
          <button
            data-testid="btn-close"
            onClick={handleClose}
            aria-label={t("editor.close")}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {errors.length > 0 && (
            <div
              data-testid="validation-errors"
              className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/60 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 space-y-0.5"
            >
              {errors.map((e, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="mt-0.5">•</span>
                  <span>{e}</span>
                </div>
              ))}
            </div>
          )}

          {/* Name */}
          <div>
            <label className={labelClass}>{t("editor.name")}</label>
            <input
              data-testid="field-name"
              type="text"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Source / Destination */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className={labelClass}>{t("editor.sourceDir")}</label>
              <input
                data-testid="field-source-dir"
                type="text"
                value={form.source_dir}
                onChange={(e) => updateField("source_dir", e.target.value)}
                className={inputClass}
              />
            </div>
            <button
              onClick={selectSource}
              className="self-end px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
            >
              📁
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className={labelClass}>{t("editor.destinationDir")}</label>
              <input
                data-testid="field-dest-dir"
                type="text"
                value={form.destination_dir}
                onChange={(e) => updateField("destination_dir", e.target.value)}
                className={inputClass}
              />
            </div>
            <button
              onClick={selectDest}
              className="self-end px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
            >
              📁
            </button>
          </div>

          {/* Action + Overwrite */}
          <div className="flex items-center gap-6">
            <div>
              <label className={labelClass}>{t("editor.action")}</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    checked={form.action === "move"}
                    onChange={() => updateField("action", "move" as Action)}
                    className="accent-blue-600 dark:accent-blue-400"
                  />
                  {t("ruleset.move")}
                </label>
                <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    checked={form.action === "copy"}
                    onChange={() => updateField("action", "copy" as Action)}
                    className="accent-blue-600 dark:accent-blue-400"
                  />
                  {t("ruleset.copy")}
                </label>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 mt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.overwrite}
                onChange={(e) => updateField("overwrite", e.target.checked)}
                className="accent-blue-600 dark:accent-blue-400"
              />
              {t("editor.overwrite")}
            </label>
          </div>

          {/* Filters */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              {t("editor.filters")}
            </h3>

            {/* Extensions */}
            <div className="mb-4">
              <label className={labelXsClass}>{t("editor.extensions")}</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(form.filters.extensions ?? []).map((ext) => (
                  <span
                    key={ext}
                    className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full text-xs font-mono"
                  >
                    {ext}
                    <button
                      onClick={() => removeExtension(ext)}
                      className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  data-testid="extension-input"
                  type="text"
                  value={extensionInput}
                  onChange={(e) => setExtensionInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.preventDefault(), addExtension())
                  }
                  placeholder=".jpg"
                  className="flex-1 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-md text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-blue-400/40 focus:border-blue-400 dark:focus:border-blue-500 font-mono transition-colors"
                />
                <button
                  data-testid="btn-extension-add"
                  onClick={addExtension}
                  className="px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {t("editor.extensionAdd")}
                </button>
              </div>
            </div>

            {/* Filename pattern */}
            <div className="mb-4">
              <label className={labelXsClass}>{t("editor.filename")}</label>
              <div className="flex gap-4 mb-1.5">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="radio"
                    checked={
                      !form.filters.filename ||
                      form.filters.filename.match_type === "glob"
                    }
                    onChange={() =>
                      updateFilters({
                        filename: form.filters.filename
                          ? {
                              ...form.filters.filename,
                              match_type: "glob" as MatchType,
                            }
                          : null,
                      })
                    }
                    className="accent-blue-600 dark:accent-blue-400"
                  />
                  {t("editor.matchTypeGlob")}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="radio"
                    checked={form.filters.filename?.match_type === "regex"}
                    onChange={() =>
                      updateFilters({
                        filename: {
                          pattern: form.filters.filename?.pattern ?? "",
                          match_type: "regex" as MatchType,
                        },
                      })
                    }
                    className="accent-blue-600 dark:accent-blue-400"
                  />
                  {t("editor.matchTypeRegex")}
                </label>
              </div>
              <input
                type="text"
                value={form.filters.filename?.pattern ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value) {
                    updateFilters({
                      filename: {
                        pattern: value,
                        match_type: form.filters.filename?.match_type ?? "glob",
                      },
                    });
                  } else {
                    updateFilters({ filename: null });
                  }
                }}
                placeholder={t("editor.pattern")}
                className="w-full px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-md text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-blue-400/40 focus:border-blue-400 dark:focus:border-blue-500 font-mono transition-colors"
              />
            </div>

            {/* Date ranges */}
            {(["created_at", "modified_at"] as const).map((field) => (
              <div key={field} className="mb-4">
                <label className={labelXsClass}>
                  {t(field === "created_at" ? "editor.createdAt" : "editor.modifiedAt")}
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {t("editor.dateStart")}
                    </span>
                    <input
                      type="datetime-local"
                      value={form.filters[field]?.start ?? ""}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        const current = form.filters[field];
                        if (!val && !current?.end) {
                          updateFilters({ [field]: null });
                        } else {
                          updateFilters({
                            [field]: { start: val, end: current?.end ?? null },
                          });
                        }
                      }}
                      className="w-full px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-md text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-blue-400/40 focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {t("editor.dateEnd")}
                    </span>
                    <input
                      type="datetime-local"
                      value={form.filters[field]?.end ?? ""}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        const current = form.filters[field];
                        if (!val && !current?.start) {
                          updateFilters({ [field]: null });
                        } else {
                          updateFilters({
                            [field]: {
                              start: current?.start ?? null,
                              end: val,
                            },
                          });
                        }
                      }}
                      className="w-full px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-md text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-blue-400/40 focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-800">
          <button
            data-testid="btn-cancel"
            onClick={handleClose}
            className="px-4 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t("editor.cancel")}
          </button>
          <button
            data-testid="btn-save"
            onClick={handleSave}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400 text-white rounded-md text-sm font-medium transition-colors shadow-sm"
          >
            {t("editor.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
