import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listSourceFiles } from "../lib/commands";

interface RegexTesterPanelProps {
  pattern: string;
  sourceDir: string;
  destinationDir: string;
}

type RegexBuildResult =
  | { regex: RegExp; error: null }
  | { regex: null; error: string }
  | null;

function buildJsRegex(pattern: string): RegexBuildResult {
  if (!pattern) return null;
  try {
    const jsPattern = pattern
      .replace(/\(\?P</g, "(?<") // Rust named group (?P<name>...) → JS (?<name>...)
      .replace(/\[\^]/g, "[^\\]"); // Rust [^]... (] as first char in negated class) → JS [^\]...
    return { regex: new RegExp(jsPattern), error: null };
  } catch (e) {
    return { regex: null, error: (e as Error).message };
  }
}

function resolveTemplate(template: string, groups: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_, name) => groups[name] ?? `{${name}}`);
}

function hasTemplateVars(s: string): boolean {
  return /\{[^}]+\}/.test(s);
}

export function RegexTesterPanel({
  pattern,
  sourceDir,
  destinationDir,
}: RegexTesterPanelProps) {
  const { t } = useTranslation();
  const [sampleInput, setSampleInput] = useState("");
  const [sourceFiles, setSourceFiles] = useState<string[] | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const regexResult = useMemo(() => buildJsRegex(pattern), [pattern]);

  const sampleMatchResult = useMemo(() => {
    if (!regexResult?.regex || !sampleInput) return null;
    const match = regexResult.regex.exec(sampleInput);
    if (!match) return { matched: false, groups: {} as Record<string, string> };
    return { matched: true, groups: (match.groups ?? {}) as Record<string, string> };
  }, [regexResult, sampleInput]);

  const resolvedSamplePath = useMemo(() => {
    if (
      !sampleMatchResult?.matched ||
      !destinationDir ||
      !hasTemplateVars(destinationDir)
    )
      return null;
    return resolveTemplate(destinationDir, sampleMatchResult.groups);
  }, [sampleMatchResult, destinationDir]);

  async function handleLoadFiles() {
    if (!sourceDir) return;
    setIsLoadingFiles(true);
    setLoadError(null);
    setSourceFiles(null);
    try {
      const files = await listSourceFiles(sourceDir);
      setSourceFiles(files);
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setIsLoadingFiles(false);
    }
  }

  const fileMatchResults = useMemo(() => {
    if (!sourceFiles || !regexResult?.regex) return null;
    return sourceFiles.map((filename) => {
      const match = regexResult.regex!.exec(filename);
      if (!match)
        return {
          filename,
          matched: false,
          groups: {} as Record<string, string>,
          resolvedPath: null,
        };
      const groups = (match.groups ?? {}) as Record<string, string>;
      const resolvedPath =
        destinationDir && hasTemplateVars(destinationDir)
          ? resolveTemplate(destinationDir, groups)
          : null;
      return { filename, matched: true, groups, resolvedPath };
    });
  }, [sourceFiles, regexResult, destinationDir]);

  const matchedCount = fileMatchResults?.filter((r) => r.matched).length ?? 0;

  const panelClass =
    "mt-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs";
  const sectionClass = "px-3 py-2.5";

  return (
    <div className={panelClass} data-testid="regex-tester-panel">
      <div className={sectionClass}>
        <p className="text-slate-500 dark:text-slate-400 mb-1.5">
          {t("editor.regexTester.sampleInput")}
        </p>
        <input
          data-testid="regex-sample-input"
          type="text"
          value={sampleInput}
          onChange={(e) => setSampleInput(e.target.value)}
          placeholder={t("editor.regexTester.samplePlaceholder")}
          className="w-full px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-md text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:focus:ring-blue-400/40 focus:border-blue-400 dark:focus:border-blue-500 font-mono transition-colors"
        />

        {regexResult?.error && (
          <p
            data-testid="regex-syntax-error"
            className="mt-1.5 text-red-500 dark:text-red-400"
          >
            {t("editor.regexTester.syntaxError", {
              message: regexResult.error,
            })}
          </p>
        )}

        {sampleMatchResult !== null && (
          <div className="mt-1.5 space-y-1">
            <p
              data-testid="regex-match-result"
              className={
                sampleMatchResult.matched
                  ? "text-green-600 dark:text-green-400 font-medium"
                  : "text-slate-400 dark:text-slate-500"
              }
            >
              {sampleMatchResult.matched
                ? t("editor.regexTester.matched")
                : t("editor.regexTester.noMatch")}
            </p>

            {sampleMatchResult.matched &&
              Object.keys(sampleMatchResult.groups).length > 0 && (
                <div data-testid="regex-capture-groups" className="mt-1 space-y-0.5">
                  {Object.entries(sampleMatchResult.groups).map(([name, value]) => (
                    <div key={name} className="flex gap-1.5 font-mono">
                      <span className="text-blue-500 dark:text-blue-400">{name}</span>
                      <span className="text-slate-400 dark:text-slate-500">=</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        "{value}"
                      </span>
                    </div>
                  ))}
                </div>
              )}

            {resolvedSamplePath && (
              <p
                data-testid="regex-resolved-path"
                className="font-mono text-slate-600 dark:text-slate-400"
              >
                {t("editor.regexTester.resolvedPath")}: {resolvedSamplePath}
              </p>
            )}
          </div>
        )}
      </div>

      {sourceDir && (
        <div className="border-t border-slate-200 dark:border-slate-700 px-3 py-2.5">
          <button
            data-testid="regex-load-files-btn"
            onClick={handleLoadFiles}
            disabled={isLoadingFiles}
            className="px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {t("editor.regexTester.loadFiles")}
          </button>

          {loadError && (
            <p
              data-testid="regex-load-error"
              className="mt-1.5 text-red-500 dark:text-red-400"
            >
              {t("editor.regexTester.loadError", { message: loadError })}
            </p>
          )}

          {fileMatchResults && (
            <div className="mt-2" data-testid="regex-file-list">
              <p
                data-testid="regex-match-count"
                className="mb-1.5 text-slate-500 dark:text-slate-400"
              >
                {t("editor.regexTester.matchCount", {
                  matched: matchedCount,
                  total: fileMatchResults.length,
                })}
              </p>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {fileMatchResults
                  .filter((r) => r.matched)
                  .map((result) => (
                    <div
                      key={result.filename}
                      className="flex items-start gap-1.5 font-mono"
                    >
                      <span className="text-green-500 dark:text-green-400 flex-none">
                        ✓
                      </span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {result.filename}
                      </span>
                      {result.resolvedPath && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600 flex-none">
                            →
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {result.resolvedPath}
                          </span>
                        </>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
