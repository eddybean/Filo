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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isNew ? t("editor.titleCreate") : t("editor.title")}
          </h2>
          <button
            onClick={handleClose}
            aria-label={t("editor.close")}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">
              {errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1">{t("editor.name")}</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              className="w-full px-3 py-1.5 border rounded text-sm"
            />
          </div>

          {/* Source / Destination */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t("editor.sourceDir")}
              </label>
              <input
                type="text"
                value={form.source_dir}
                onChange={(e) => updateField("source_dir", e.target.value)}
                className="w-full px-3 py-1.5 border rounded text-sm"
              />
            </div>
            <button
              onClick={selectSource}
              className="self-end px-2 py-1.5 border rounded hover:bg-gray-50"
            >
              📁
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t("editor.destinationDir")}
              </label>
              <input
                type="text"
                value={form.destination_dir}
                onChange={(e) => updateField("destination_dir", e.target.value)}
                className="w-full px-3 py-1.5 border rounded text-sm"
              />
            </div>
            <button
              onClick={selectDest}
              className="self-end px-2 py-1.5 border rounded hover:bg-gray-50"
            >
              📁
            </button>
          </div>

          {/* Action + Overwrite */}
          <div className="flex items-center gap-6">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t("editor.action")}
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    checked={form.action === "move"}
                    onChange={() => updateField("action", "move" as Action)}
                  />
                  {t("ruleset.move")}
                </label>
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    checked={form.action === "copy"}
                    onChange={() => updateField("action", "copy" as Action)}
                  />
                  {t("ruleset.copy")}
                </label>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm mt-5">
              <input
                type="checkbox"
                checked={form.overwrite}
                onChange={(e) => updateField("overwrite", e.target.checked)}
              />
              {t("editor.overwrite")}
            </label>
          </div>

          {/* Filters */}
          <div className="border-t pt-3">
            <h3 className="text-sm font-semibold mb-3">{t("editor.filters")}</h3>

            {/* Extensions */}
            <div className="mb-3">
              <label className="block text-xs font-medium mb-1">
                {t("editor.extensions")}
              </label>
              <div className="flex flex-wrap gap-1 mb-1">
                {(form.filters.extensions ?? []).map((ext) => (
                  <span
                    key={ext}
                    className="inline-flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-xs"
                  >
                    {ext}
                    <button
                      onClick={() => removeExtension(ext)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={extensionInput}
                  onChange={(e) => setExtensionInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.preventDefault(), addExtension())
                  }
                  placeholder=".jpg"
                  className="flex-1 px-2 py-1 border rounded text-xs"
                />
                <button
                  onClick={addExtension}
                  className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                >
                  {t("editor.extensionAdd")}
                </button>
              </div>
            </div>

            {/* Filename pattern */}
            <div className="mb-3">
              <label className="block text-xs font-medium mb-1">
                {t("editor.filename")}
              </label>
              <div className="flex gap-3 mb-1">
                <label className="flex items-center gap-1 text-xs">
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
                  />
                  {t("editor.matchTypeGlob")}
                </label>
                <label className="flex items-center gap-1 text-xs">
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
                className="w-full px-2 py-1 border rounded text-xs"
              />
            </div>

            {/* Date ranges */}
            {(["created_at", "modified_at"] as const).map((field) => (
              <div key={field} className="mb-3">
                <label className="block text-xs font-medium mb-1">
                  {t(field === "created_at" ? "editor.createdAt" : "editor.modifiedAt")}
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <span className="text-xs text-gray-500">{t("editor.dateStart")}</span>
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
                      className="w-full px-2 py-1 border rounded text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="text-xs text-gray-500">{t("editor.dateEnd")}</span>
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
                      className="w-full px-2 py-1 border rounded text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button
            onClick={handleClose}
            className="px-4 py-1.5 border rounded text-sm hover:bg-gray-50"
          >
            {t("editor.cancel")}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            {t("editor.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
