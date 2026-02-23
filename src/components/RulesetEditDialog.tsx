import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { Ruleset, Action, MatchType, Filters } from "../lib/types";
import { RegexTesterPanel } from "./RegexTesterPanel";
import { Toast } from "./Toast";

/** RFC3339文字列 → datetime-local入力用文字列 ("YYYY-MM-DDTHH:mm") */
function rfc3339ToDatetimeLocal(value: string | null): string | null {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return null;
  }
}

/** datetime-local入力値 ("YYYY-MM-DDTHH:mm") → RFC3339文字列 (ローカルタイムゾーン付き) */
function datetimeLocalToRfc3339(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const h = Math.floor(Math.abs(offset) / 60)
    .toString()
    .padStart(2, "0");
  const m = (Math.abs(offset) % 60).toString().padStart(2, "0");
  return `${value}:00${sign}${h}:${m}`;
}

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

/** 保存済みルールセットのRFC3339日時値をフォーム表示用のdatetime-local形式に変換する */
function toFormRuleset(ruleset: Ruleset): Ruleset {
  const convertRange = (range: Ruleset["filters"]["created_at"]) => {
    if (!range) return null;
    return {
      start: rfc3339ToDatetimeLocal(range.start),
      end: rfc3339ToDatetimeLocal(range.end),
    };
  };
  return {
    ...ruleset,
    filters: {
      ...ruleset.filters,
      created_at: convertRange(ruleset.filters.created_at),
      modified_at: convertRange(ruleset.filters.modified_at),
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
  const initialForm = useRef<Ruleset>(ruleset ? toFormRuleset(ruleset) : emptyRuleset());
  const [form, setForm] = useState<Ruleset>(
    ruleset ? toFormRuleset(ruleset) : emptyRuleset(),
  );
  const [extensionInput, setExtensionInput] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const dateTimeRefs = useRef<Partial<Record<string, HTMLInputElement | null>>>({});

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

  function hasTemplateVars(s: string): boolean {
    return /\{[^}]+\}/.test(s);
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

    if (
      hasTemplateVars(form.destination_dir) &&
      form.filters.filename?.match_type !== "regex"
    ) {
      errs.push(t("editor.validation.destinationTemplateRequiresRegex"));
    }

    const dtKeys: Array<[string, string]> = [
      ["created_at", "start"],
      ["created_at", "end"],
      ["modified_at", "start"],
      ["modified_at", "end"],
    ];
    if (dtKeys.some(([f, p]) => dateTimeRefs.current[`${f}_${p}`]?.validity.badInput)) {
      errs.push(t("editor.validation.invalidDatetime"));
    }

    setErrors(errs);
    return errs.length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    try {
      const convertRange = (range: Ruleset["filters"]["created_at"]) => {
        if (!range) return null;
        return {
          start: datetimeLocalToRfc3339(range.start),
          end: datetimeLocalToRfc3339(range.end),
        };
      };
      const rulesetToSave: Ruleset = {
        ...form,
        filters: {
          ...form.filters,
          created_at: convertRange(form.filters.created_at),
          modified_at: convertRange(form.filters.modified_at),
        },
      };
      await onSave(rulesetToSave);
    } catch (e) {
      setErrors([String(e)]);
    }
  }

  const handleClose = useCallback(async () => {
    if (JSON.stringify(form) !== JSON.stringify(initialForm.current)) {
      const ok = await confirm(t("editor.discardConfirm"));
      if (!ok) return;
    }
    onCancel();
  }, [form, t, onCancel]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleClose]);

  async function selectSource() {
    const path = await onSelectFolder();
    if (path) updateField("source_dir", path);
  }

  async function selectDest() {
    const path = await onSelectFolder();
    if (path) updateField("destination_dir", path);
  }

  const inputClass =
    "w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-blue-400/40 focus:border-blue-400 dark:focus:border-blue-500 transition-colors";

  const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";
  const labelXsClass =
    "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1";

  return (
    <>
      <div
        data-testid="edit-dialog"
        className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 backdrop-blur-[6px]"
      >
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.25),0_8px_16px_rgba(0,0,0,0.10)] w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700/60">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-none">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {isNew ? t("editor.titleCreate") : t("editor.title")}
            </h2>
            <button
              data-testid="btn-close"
              onClick={handleClose}
              aria-label={t("editor.close")}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>

          <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
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
            <div>
              <label className={labelClass}>{t("editor.sourceDir")}</label>
              <div className="relative">
                <input
                  data-testid="field-source-dir"
                  type="text"
                  value={form.source_dir}
                  onChange={(e) => updateField("source_dir", e.target.value)}
                  className={`${inputClass} pr-9`}
                />
                <button
                  onClick={selectSource}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>{t("editor.destinationDir")}</label>
              <div className="relative">
                <input
                  data-testid="field-dest-dir"
                  type="text"
                  value={form.destination_dir}
                  onChange={(e) => updateField("destination_dir", e.target.value)}
                  className={`${inputClass} pr-9`}
                />
                <button
                  onClick={selectDest}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
                    />
                  </svg>
                </button>
              </div>
              {form.filters.filename?.match_type === "regex" && (
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  {t("editor.destinationTemplateHint")}
                </p>
              )}
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
            <div className="pt-4 mt-1 border-t border-slate-100 dark:border-slate-800/70">
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
                    className="flex-1 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-blue-400/40 focus:border-blue-400 dark:focus:border-blue-500 font-mono transition-colors"
                  />
                  <button
                    data-testid="btn-extension-add"
                    onClick={addExtension}
                    className="px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
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
                  className="w-full px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-blue-400/40 focus:border-blue-400 dark:focus:border-blue-500 font-mono transition-colors"
                />
                {form.filters.filename?.match_type === "regex" && (
                  <RegexTesterPanel
                    pattern={form.filters.filename.pattern}
                    sourceDir={form.source_dir}
                    destinationDir={form.destination_dir}
                  />
                )}
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
                      <div className="relative">
                        <input
                          ref={(el) => {
                            dateTimeRefs.current[`${field}_start`] = el;
                          }}
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
                          className="w-full px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-blue-400/40 focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                        />
                        {form.filters[field]?.start && (
                          <button
                            aria-label={t("editor.dateClear")}
                            onClick={() => {
                              const end = form.filters[field]?.end ?? null;
                              updateFilters({
                                [field]: end ? { start: null, end } : null,
                              });
                            }}
                            className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors text-xs leading-none"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex-1">
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {t("editor.dateEnd")}
                      </span>
                      <div className="relative">
                        <input
                          ref={(el) => {
                            dateTimeRefs.current[`${field}_end`] = el;
                          }}
                          type="datetime-local"
                          value={form.filters[field]?.end ?? ""}
                          onChange={(e) => {
                            const val = e.target.value || null;
                            const current = form.filters[field];
                            if (!val && !current?.start) {
                              updateFilters({ [field]: null });
                            } else {
                              updateFilters({
                                [field]: { start: current?.start ?? null, end: val },
                              });
                            }
                          }}
                          className="w-full px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-blue-400/40 focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                        />
                        {form.filters[field]?.end && (
                          <button
                            aria-label={t("editor.dateClear")}
                            onClick={() => {
                              const start = form.filters[field]?.start ?? null;
                              updateFilters({
                                [field]: start ? { start, end: null } : null,
                              });
                            }}
                            className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors text-xs leading-none"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex-none">
            <button
              data-testid="btn-cancel"
              onClick={handleClose}
              className="px-4 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {t("editor.cancel")}
            </button>
            <button
              data-testid="btn-save"
              onClick={handleSave}
              className="px-4 py-1.5 bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white rounded-lg text-sm font-medium transition-all duration-150 shadow-sm shadow-blue-500/20"
            >
              {t("editor.save")}
            </button>
          </div>
        </div>
      </div>
      <Toast messages={errors} onDismiss={() => setErrors([])} />
    </>
  );
}
