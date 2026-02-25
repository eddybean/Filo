use crate::filters::{extract_named_captures, matches_filters};
use crate::ruleset::{Action, Ruleset};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Instant;

static TEMPLATE_VAR_RE: OnceLock<regex::Regex> = OnceLock::new();

fn get_template_var_re() -> &'static regex::Regex {
    TEMPLATE_VAR_RE
        .get_or_init(|| regex::Regex::new(r"\{([^}]+)\}").expect("static pattern is valid"))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ExecutionStatus {
    Completed,
    PartialFailure,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileResult {
    pub filename: String,
    pub source_path: PathBuf,
    pub destination_path: Option<PathBuf>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub ruleset_id: String,
    pub ruleset_name: String,
    pub action: Action,
    pub status: ExecutionStatus,
    pub succeeded: Vec<FileResult>,
    pub skipped: Vec<FileResult>,
    pub errors: Vec<FileResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UndoRequest {
    pub source_path: PathBuf,
    pub destination_path: PathBuf,
}

impl ExecutionResult {
    fn determine_status(succeeded: &[FileResult], errors: &[FileResult]) -> ExecutionStatus {
        if errors.is_empty() {
            ExecutionStatus::Completed
        } else if succeeded.is_empty() {
            ExecutionStatus::Failed
        } else {
            ExecutionStatus::PartialFailure
        }
    }
}

fn is_cross_device_error(err: &io::Error) -> bool {
    err.kind() == io::ErrorKind::CrossesDevices
}

/// Windows: CopyFile2 で SMB 圧縮転送フラグ付きコピーを実行し、コピー後の宛先サイズを返す。
/// COPY_FILE_REQUEST_COMPRESSED_TRAFFIC (0x10000000) は Windows 10 v19041+ でのみ有効。
/// SMB サーバーが非対応の場合は無視され、通常コピーにフォールバックするため安全。
#[cfg(target_os = "windows")]
fn platform_copy(src: &Path, dest: &Path) -> io::Result<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{CopyFile2, COPYFILE2_EXTENDED_PARAMETERS};

    const COPY_FILE_REQUEST_COMPRESSED_TRAFFIC: u32 = 0x1000_0000;

    let src_wide: Vec<u16> = src.as_os_str().encode_wide().chain(Some(0)).collect();
    let dest_wide: Vec<u16> = dest.as_os_str().encode_wide().chain(Some(0)).collect();

    let params = COPYFILE2_EXTENDED_PARAMETERS {
        dwSize: std::mem::size_of::<COPYFILE2_EXTENDED_PARAMETERS>() as u32,
        dwCopyFlags: COPY_FILE_REQUEST_COMPRESSED_TRAFFIC,
        pfCancel: std::ptr::null_mut(),
        pProgressRoutine: None,
        pvCallbackContext: std::ptr::null_mut(),
    };

    // Safety: src_wide と dest_wide はヌル終端ワイド文字列。params は有効な構造体。
    let hr = unsafe { CopyFile2(src_wide.as_ptr(), dest_wide.as_ptr(), &params) };

    if hr < 0 {
        // HRESULT_CODE(hr) = hr & 0xFFFF で Win32 エラーコードを取得
        return Err(io::Error::from_raw_os_error(hr & 0x0000_FFFF));
    }

    // CopyFile2 はバイト数を返さないためコピー後の宛先サイズを返す
    fs::metadata(dest).map(|m| m.len())
}

#[cfg(not(target_os = "windows"))]
fn platform_copy(src: &Path, dest: &Path) -> io::Result<u64> {
    fs::copy(src, dest)
}

fn copy_and_verify(src: &Path, dest: &Path, expected_size: u64) -> io::Result<()> {
    let copied = platform_copy(src, dest).map_err(|e| {
        let _ = fs::remove_file(dest);
        e
    })?;
    if copied != expected_size {
        let _ = fs::remove_file(dest);
        return Err(io::Error::new(
            io::ErrorKind::Other,
            format!(
                "Copy incomplete: expected {} bytes, got {} bytes",
                expected_size, copied
            ),
        ));
    }
    Ok(())
}

fn move_file(src: &Path, dest: &Path, file_size: u64) -> io::Result<()> {
    match fs::rename(src, dest) {
        Ok(()) => Ok(()),
        Err(e) if is_cross_device_error(&e) => {
            copy_and_verify(src, dest, file_size)?;
            fs::remove_file(src)
        }
        Err(e) => Err(e),
    }
}

fn classify_io_error(e: &io::Error) -> String {
    match e.kind() {
        io::ErrorKind::PermissionDenied => format!("Permission denied: {}", e),
        io::ErrorKind::StorageFull => format!("Disk full: {}", e),
        io::ErrorKind::NotFound => format!("File not found: {}", e),
        io::ErrorKind::CrossesDevices => format!("Cross-device operation failed: {}", e),
        _ => format!("Operation failed: {}", e),
    }
}

/// `destination_dir` にテンプレート変数 `{xxx}` が含まれているか判定する。
fn has_template_vars(s: &str) -> bool {
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '{' {
            if chars.peek().is_some() {
                // 閉じ括弧が存在するか確認
                for inner in chars.by_ref() {
                    if inner == '}' {
                        return true;
                    }
                }
            }
        }
    }
    false
}

/// Windows のパスコンポーネントとして使えない文字を `_` に置換する。
fn sanitize_path_component(s: &str) -> String {
    s.chars()
        .map(|c| {
            if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                '_'
            } else {
                c
            }
        })
        .collect()
}

/// テンプレート文字列内の `{varname}` を captures の値で置換する。
/// - 変数名が captures に存在しない場合は `Err`
/// - 値が空文字の場合は `Err`
/// - 値は `sanitize_path_component` でサニタイズされる
fn resolve_destination_template(
    template: &str,
    captures: &HashMap<String, String>,
) -> Result<String, String> {
    let re = get_template_var_re();
    let mut error: Option<String> = None;
    let result = re.replace_all(template, |caps: &regex::Captures| {
        let var_name = &caps[1];
        match captures.get(var_name) {
            Some(val) if !val.is_empty() => sanitize_path_component(val),
            Some(_) => {
                error.get_or_insert_with(|| {
                    format!("Template variable '{}' resolved to empty string", var_name)
                });
                String::new()
            }
            None => {
                error.get_or_insert_with(|| {
                    format!(
                        "Template variable '{}' not found in regex capture groups",
                        var_name
                    )
                });
                String::new()
            }
        }
    });
    match error {
        Some(e) => Err(e),
        None => Ok(result.into_owned()),
    }
}

/// フィルタを通過したファイルの情報（処理前に列挙済み）
struct PendingFile {
    path: PathBuf,
    filename: String,
    file_size: u64,
}

/// `on_progress(filename, current, total, bytes_per_second)` を呼びながらルールセットを実行する。
/// `cancel_flag` が `true` になると、処理中のファイルが完了した後、残りのファイルを
/// 「ユーザーによる中断」としてスキップして早期リターンする。
pub fn execute_ruleset(
    ruleset: &Ruleset,
    on_progress: impl Fn(&str, usize, usize, f64),
    cancel_flag: &AtomicBool,
) -> ExecutionResult {
    let mut succeeded = Vec::new();
    let mut skipped = Vec::new();
    let mut errors = Vec::new();

    let source_dir = ruleset.source_path();
    let destination_dir = ruleset.destination_path();

    // Check source directory
    if !source_dir.exists() {
        return ExecutionResult {
            ruleset_id: ruleset.id.clone(),
            ruleset_name: ruleset.name.clone(),
            action: ruleset.action.clone(),
            status: ExecutionStatus::Failed,
            succeeded,
            skipped,
            errors: vec![FileResult {
                filename: String::new(),
                source_path: source_dir,
                destination_path: None,
                reason: Some("Source directory does not exist".to_string()),
            }],
        };
    }

    // テンプレート変数がない場合のみ事前に destination_dir を作成する。
    // テンプレートがある場合はファイルごとに解決して作成する。
    let use_template = has_template_vars(&ruleset.destination_dir);
    if !use_template {
        if let Err(e) = fs::create_dir_all(&destination_dir) {
            return ExecutionResult {
                ruleset_id: ruleset.id.clone(),
                ruleset_name: ruleset.name.clone(),
                action: ruleset.action.clone(),
                status: ExecutionStatus::Failed,
                succeeded,
                skipped,
                errors: vec![FileResult {
                    filename: String::new(),
                    source_path: destination_dir,
                    destination_path: None,
                    reason: Some(format!("Failed to create destination directory: {}", e)),
                }],
            };
        }
    }

    // List files in source directory (non-recursive)
    let entries = match fs::read_dir(&source_dir) {
        Ok(entries) => entries,
        Err(e) => {
            return ExecutionResult {
                ruleset_id: ruleset.id.clone(),
                ruleset_name: ruleset.name.clone(),
                action: ruleset.action.clone(),
                status: ExecutionStatus::Failed,
                succeeded,
                skipped,
                errors: vec![FileResult {
                    filename: String::new(),
                    source_path: source_dir,
                    destination_path: None,
                    reason: Some(format!("Failed to read source directory: {}", e)),
                }],
            };
        }
    };

    // フィルタを通過するファイルを事前に列挙して総数を確定する。
    // メタデータ取得に失敗したファイルはエラーとして記録し、列挙対象から除外する。
    let mut matching_files: Vec<PendingFile> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            continue;
        }
        let metadata = match fs::metadata(&path) {
            Ok(m) => m,
            Err(e) => {
                errors.push(FileResult {
                    filename: path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    source_path: path,
                    destination_path: None,
                    reason: Some(format!("Failed to read metadata: {}", e)),
                });
                continue;
            }
        };
        if !matches_filters(&path, &metadata, &ruleset.filters) {
            continue;
        }
        let filename = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        matching_files.push(PendingFile {
            path,
            filename,
            file_size: metadata.len(),
        });
    }

    let total = matching_files.len();
    let mut bytes_transferred: u64 = 0;
    let start_time = Instant::now();
    let mut last_progress_emit: Option<Instant> = None;
    const PROGRESS_THROTTLE_MS: u128 = 100;

    // テンプレート変数がある場合、ファイル名フィルタのパターンをループ外で一度だけコンパイルする
    let filename_regex: Option<regex::Regex> = if use_template {
        ruleset
            .filters
            .filename
            .as_ref()
            .and_then(|f| regex::Regex::new(&f.pattern).ok())
    } else {
        None
    };

    // テンプレートモードで create_dir_all の重複呼び出しを避けるキャッシュ
    let mut created_dirs: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    for (i, pending) in matching_files.iter().enumerate() {
        let elapsed = start_time.elapsed().as_secs_f64();
        let bps = if elapsed > 0.0 {
            bytes_transferred as f64 / elapsed
        } else {
            0.0
        };
        // 初回・100ms経過・最終ファイルのいずれかで進捗通知する
        let now = Instant::now();
        let should_emit = last_progress_emit
            .map_or(true, |t| now.duration_since(t).as_millis() >= PROGRESS_THROTTLE_MS)
            || i + 1 == total;
        if should_emit {
            on_progress(&pending.filename, i + 1, total, bps);
            last_progress_emit = Some(now);
        }

        // ラベル付きブロックで早期脱出しても、末尾のキャンセルチェックに必ず到達する
        'process: {
            // テンプレート変数がある場合はファイル名からキャプチャを取得して解決する
            let resolved_dir = if use_template {
                let caps = if let Some(re) = filename_regex.as_ref() {
                    extract_named_captures(&pending.filename, re)
                } else {
                    HashMap::new()
                };
                match resolve_destination_template(&ruleset.destination_dir, &caps) {
                    Ok(dir) => PathBuf::from(dir),
                    Err(reason) => {
                        skipped.push(FileResult {
                            filename: pending.filename.clone(),
                            source_path: pending.path.clone(),
                            destination_path: None,
                            reason: Some(reason),
                        });
                        break 'process;
                    }
                }
            } else {
                destination_dir.clone()
            };

            // テンプレートで解決された場合はディレクトリを作成する（キャッシュで重複呼び出しを回避）
            if use_template && !created_dirs.contains(&resolved_dir) {
                if let Err(e) = fs::create_dir_all(&resolved_dir) {
                    errors.push(FileResult {
                        filename: pending.filename.clone(),
                        source_path: pending.path.clone(),
                        destination_path: None,
                        reason: Some(format!("Failed to create destination directory: {}", e)),
                    });
                    break 'process;
                }
                created_dirs.insert(resolved_dir.clone());
            }

            let dest_path = resolved_dir.join(&pending.filename);

            // Check for existing file
            if dest_path.exists() && !ruleset.overwrite {
                skipped.push(FileResult {
                    filename: pending.filename.clone(),
                    source_path: pending.path.clone(),
                    destination_path: Some(dest_path),
                    reason: Some("File with same name exists at destination".to_string()),
                });
                break 'process;
            }

            // Execute action
            let result = match ruleset.action {
                Action::Move => move_file(&pending.path, &dest_path, pending.file_size),
                Action::Copy => copy_and_verify(&pending.path, &dest_path, pending.file_size),
            };

            match result {
                Ok(()) => {
                    bytes_transferred += pending.file_size;
                    succeeded.push(FileResult {
                        filename: pending.filename.clone(),
                        source_path: pending.path.clone(),
                        destination_path: Some(dest_path),
                        reason: None,
                    });
                }
                Err(e) => {
                    errors.push(FileResult {
                        filename: pending.filename.clone(),
                        source_path: pending.path.clone(),
                        destination_path: Some(dest_path),
                        reason: Some(classify_io_error(&e)),
                    });
                }
            }
        } // end 'process

        // キャンセルチェック: 常にここに到達する。
        // 処理中のファイルが完了した後、残りのファイルをスキップしてループを抜ける。
        if cancel_flag.load(Ordering::Relaxed) {
            for rem in &matching_files[i + 1..] {
                skipped.push(FileResult {
                    filename: rem.filename.clone(),
                    source_path: rem.path.clone(),
                    destination_path: None,
                    reason: Some("Cancelled by user".to_string()),
                });
            }
            break;
        }
    }

    let status = ExecutionResult::determine_status(&succeeded, &errors);

    ExecutionResult {
        ruleset_id: ruleset.id.clone(),
        ruleset_name: ruleset.name.clone(),
        action: ruleset.action.clone(),
        status,
        succeeded,
        skipped,
        errors,
    }
}

pub fn undo_file_move(source_path: &Path, destination_path: &Path) -> Result<(), String> {
    // destination_path is where the file currently is (moved to)
    // source_path is where it should go back to (original location)
    if !destination_path.exists() {
        return Err("File no longer exists at destination".to_string());
    }

    if source_path.exists() {
        return Err("File already exists at original location".to_string());
    }

    // Ensure parent directory exists
    if let Some(parent) = source_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let file_size = fs::metadata(destination_path)
        .map(|m| m.len())
        .unwrap_or(0);
    move_file(destination_path, source_path, file_size).map_err(|e| classify_io_error(&e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ruleset::{FilenameFilter, Filters, MatchType};

    fn no_cancel() -> AtomicBool {
        AtomicBool::new(false)
    }

    fn create_test_ruleset(source: &Path, dest: &Path) -> Ruleset {
        Ruleset {
            id: "test-id".to_string(),
            name: "test".to_string(),
            enabled: true,
            source_dir: source.to_str().unwrap().to_string(),
            destination_dir: dest.to_str().unwrap().to_string(),
            action: Action::Move,
            overwrite: false,
            filters: Filters {
                extensions: Some(vec![".txt".to_string()]),
                filename: None,
                created_at: None,
                modified_at: None,
            },
        }
    }

    #[test]
    fn test_move_files_basic() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        fs::write(src.path().join("hello.txt"), "content").unwrap();
        fs::write(src.path().join("world.txt"), "content2").unwrap();

        let ruleset = create_test_ruleset(src.path(), dst.path());
        let result = execute_ruleset(&ruleset, |_, _, _, _| {}, &no_cancel());

        assert_eq!(result.status, ExecutionStatus::Completed);
        assert_eq!(result.succeeded.len(), 2);
        assert_eq!(result.skipped.len(), 0);
        assert_eq!(result.errors.len(), 0);

        // Source files should be gone
        assert!(!src.path().join("hello.txt").exists());
        assert!(!src.path().join("world.txt").exists());

        // Destination files should exist
        assert!(dst.path().join("hello.txt").exists());
        assert!(dst.path().join("world.txt").exists());
    }

    #[test]
    fn test_copy_files_basic() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        fs::write(src.path().join("hello.txt"), "content").unwrap();

        let mut ruleset = create_test_ruleset(src.path(), dst.path());
        ruleset.action = Action::Copy;

        let result = execute_ruleset(&ruleset, |_, _, _, _| {}, &no_cancel());

        assert_eq!(result.status, ExecutionStatus::Completed);
        assert_eq!(result.succeeded.len(), 1);

        // Source file should still exist
        assert!(src.path().join("hello.txt").exists());
        // Destination file should also exist
        assert!(dst.path().join("hello.txt").exists());
    }

    #[test]
    fn test_skip_when_overwrite_disabled() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        fs::write(src.path().join("exists.txt"), "new content").unwrap();
        fs::write(dst.path().join("exists.txt"), "old content").unwrap();

        let ruleset = create_test_ruleset(src.path(), dst.path());
        let result = execute_ruleset(&ruleset, |_, _, _, _| {}, &no_cancel());

        assert_eq!(result.skipped.len(), 1);
        // Old content should remain
        assert_eq!(
            fs::read_to_string(dst.path().join("exists.txt")).unwrap(),
            "old content"
        );
    }

    #[test]
    fn test_copy_skip_when_overwrite_disabled() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        fs::write(src.path().join("exists.txt"), "new content").unwrap();
        fs::write(dst.path().join("exists.txt"), "old content").unwrap();

        let mut ruleset = create_test_ruleset(src.path(), dst.path());
        ruleset.action = Action::Copy;

        let result = execute_ruleset(&ruleset, |_, _, _, _| {}, &no_cancel());

        assert_eq!(result.skipped.len(), 1);
        // コピー元ファイルは残っている
        assert!(src.path().join("exists.txt").exists());
        // コピー先の古い内容が保護されている
        assert_eq!(
            fs::read_to_string(dst.path().join("exists.txt")).unwrap(),
            "old content"
        );
    }

    #[test]
    fn test_overwrite_when_enabled() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        fs::write(src.path().join("exists.txt"), "new content").unwrap();
        fs::write(dst.path().join("exists.txt"), "old content").unwrap();

        let mut ruleset = create_test_ruleset(src.path(), dst.path());
        ruleset.overwrite = true;

        let result = execute_ruleset(&ruleset, |_, _, _, _| {}, &no_cancel());

        assert_eq!(result.succeeded.len(), 1);
        assert_eq!(result.skipped.len(), 0);
        assert_eq!(
            fs::read_to_string(dst.path().join("exists.txt")).unwrap(),
            "new content"
        );
    }

    #[test]
    fn test_filter_only_matching_files() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        fs::write(src.path().join("match.txt"), "content").unwrap();
        fs::write(src.path().join("skip.pdf"), "content").unwrap();

        let ruleset = create_test_ruleset(src.path(), dst.path());
        let result = execute_ruleset(&ruleset, |_, _, _, _| {}, &no_cancel());

        assert_eq!(result.succeeded.len(), 1);
        assert_eq!(result.succeeded[0].filename, "match.txt");

        // pdf should remain in source
        assert!(src.path().join("skip.pdf").exists());
    }

    #[test]
    fn test_source_dir_not_exists() {
        let dst = tempfile::tempdir().unwrap();
        let non_existent = PathBuf::from("/tmp/filo_test_nonexistent_dir");

        let ruleset = create_test_ruleset(&non_existent, dst.path());
        let result = execute_ruleset(&ruleset, |_, _, _, _| {}, &no_cancel());

        assert_eq!(result.status, ExecutionStatus::Failed);
        assert_eq!(result.errors.len(), 1);
    }

    #[test]
    fn test_creates_destination_dir() {
        let src = tempfile::tempdir().unwrap();
        let dst_base = tempfile::tempdir().unwrap();
        let dst = dst_base.path().join("new_subdir");

        fs::write(src.path().join("file.txt"), "content").unwrap();

        let ruleset = create_test_ruleset(src.path(), &dst);
        let result = execute_ruleset(&ruleset, |_, _, _, _| {}, &no_cancel());

        assert_eq!(result.status, ExecutionStatus::Completed);
        assert!(dst.join("file.txt").exists());
    }

    #[test]
    fn test_skip_directories_in_source() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        fs::create_dir(src.path().join("subdir")).unwrap();
        fs::write(src.path().join("file.txt"), "content").unwrap();

        let ruleset = create_test_ruleset(src.path(), dst.path());
        let result = execute_ruleset(&ruleset, |_, _, _, _| {}, &no_cancel());

        assert_eq!(result.succeeded.len(), 1);
        // Subdirectory should remain
        assert!(src.path().join("subdir").exists());
    }

    #[test]
    fn test_glob_filename_filter() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        fs::write(src.path().join("screenshot_001.txt"), "content").unwrap();
        fs::write(src.path().join("photo.txt"), "content").unwrap();

        let mut ruleset = create_test_ruleset(src.path(), dst.path());
        ruleset.filters.filename = Some(FilenameFilter {
            pattern: "screenshot_*".to_string(),
            match_type: MatchType::Glob,
        });

        let result = execute_ruleset(&ruleset, |_, _, _, _| {}, &no_cancel());

        assert_eq!(result.succeeded.len(), 1);
        assert_eq!(result.succeeded[0].filename, "screenshot_001.txt");
    }

    // Undo tests

    #[test]
    fn test_undo_file_move_basic() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        let src_path = src.path().join("file.txt");
        let dst_path = dst.path().join("file.txt");

        fs::write(&dst_path, "content").unwrap();

        let result = undo_file_move(&src_path, &dst_path);
        assert!(result.is_ok());
        assert!(src_path.exists());
        assert!(!dst_path.exists());
    }

    #[test]
    fn test_undo_fails_when_file_missing_at_dest() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        let src_path = src.path().join("file.txt");
        let dst_path = dst.path().join("file.txt");

        let result = undo_file_move(&src_path, &dst_path);
        assert!(result.is_err());
    }

    #[test]
    fn test_undo_fails_when_file_exists_at_source() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        let src_path = src.path().join("file.txt");
        let dst_path = dst.path().join("file.txt");

        fs::write(&src_path, "original").unwrap();
        fs::write(&dst_path, "moved").unwrap();

        let result = undo_file_move(&src_path, &dst_path);
        assert!(result.is_err());
    }

    // --- ヘルパー関数のユニットテスト ---

    #[test]
    fn test_is_cross_device_error_true() {
        let e = io::Error::new(io::ErrorKind::CrossesDevices, "cross device");
        assert!(is_cross_device_error(&e));
    }

    #[test]
    fn test_is_cross_device_error_false() {
        let e = io::Error::new(io::ErrorKind::PermissionDenied, "permission denied");
        assert!(!is_cross_device_error(&e));
    }

    #[test]
    fn test_copy_and_verify_success() {
        let src_dir = tempfile::tempdir().unwrap();
        let dst_dir = tempfile::tempdir().unwrap();
        let src = src_dir.path().join("file.txt");
        let dst = dst_dir.path().join("file.txt");

        fs::write(&src, "hello world").unwrap();
        copy_and_verify(&src, &dst, 11).unwrap();

        assert!(src.exists(), "src should still exist after copy");
        assert_eq!(fs::read_to_string(&dst).unwrap(), "hello world");
    }

    #[test]
    fn test_copy_and_verify_cleans_up_on_error() {
        let dst_dir = tempfile::tempdir().unwrap();
        let nonexistent_src = dst_dir.path().join("nonexistent.txt");
        let dst = dst_dir.path().join("output.txt");

        let result = copy_and_verify(&nonexistent_src, &dst, 0);
        assert!(result.is_err());
        assert!(!dst.exists(), "dst should not exist after failed copy");
    }

    #[test]
    fn test_move_file_same_device() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src.txt");
        let dst = dir.path().join("dst.txt");

        fs::write(&src, "content").unwrap();
        move_file(&src, &dst, 7).unwrap();

        assert!(!src.exists(), "src should be gone after move");
        assert_eq!(fs::read_to_string(&dst).unwrap(), "content");
    }

    #[test]
    fn test_classify_io_error_permission_denied() {
        let e = io::Error::new(io::ErrorKind::PermissionDenied, "denied");
        let msg = classify_io_error(&e);
        assert!(msg.contains("Permission denied"), "got: {}", msg);
    }

    #[test]
    fn test_classify_io_error_storage_full() {
        let e = io::Error::new(io::ErrorKind::StorageFull, "full");
        let msg = classify_io_error(&e);
        assert!(msg.contains("Disk full"), "got: {}", msg);
    }

    #[test]
    fn test_classify_io_error_fallback() {
        let e = io::Error::new(io::ErrorKind::Other, "something else");
        let msg = classify_io_error(&e);
        assert!(msg.contains("Operation failed"), "got: {}", msg);
    }

    #[test]
    fn test_classify_io_error_not_found() {
        let e = io::Error::new(io::ErrorKind::NotFound, "not found");
        let msg = classify_io_error(&e);
        assert!(msg.contains("File not found"), "got: {}", msg);
    }

    #[test]
    fn test_classify_io_error_cross_device() {
        let e = io::Error::new(io::ErrorKind::CrossesDevices, "cross device");
        let msg = classify_io_error(&e);
        assert!(msg.contains("Cross-device"), "got: {}", msg);
    }

    #[test]
    fn test_copy_and_verify_empty_file() {
        let src_dir = tempfile::tempdir().unwrap();
        let dst_dir = tempfile::tempdir().unwrap();
        let src = src_dir.path().join("empty.txt");
        let dst = dst_dir.path().join("empty.txt");

        fs::write(&src, b"").unwrap();
        copy_and_verify(&src, &dst, 0).unwrap();

        assert_eq!(fs::metadata(&dst).unwrap().len(), 0);
    }

    // fs::copy が失敗する（dest の親ディレクトリが存在しない）ときに
    // dest の残骸が残らないことを確認する
    #[test]
    fn test_copy_and_verify_cleans_up_when_dest_parent_missing() {
        let src_dir = tempfile::tempdir().unwrap();
        let src = src_dir.path().join("file.txt");
        fs::write(&src, "data").unwrap();

        // 存在しない中間ディレクトリを含む dest パス → fs::copy が失敗する
        let dst = src_dir.path().join("nonexistent_subdir").join("file.txt");

        let result = copy_and_verify(&src, &dst, 4);
        assert!(result.is_err());
        assert!(!dst.exists(), "partial dest should not exist");
        // src は安全に残っていること
        assert!(src.exists(), "src must be preserved on copy failure");
    }

    #[test]
    fn test_move_file_propagates_non_cross_device_error() {
        // src が存在しない場合、rename が NotFound で失敗し、
        // copy_and_verify にフォールバックせずそのままエラーを返す
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("nonexistent.txt");
        let dst = dir.path().join("dst.txt");

        let result = move_file(&src, &dst, 0);
        assert!(result.is_err());
        // フォールバックで copy が試みられていないので dst は存在しない
        assert!(!dst.exists(), "dst must not be created on move failure");
    }

    #[test]
    fn test_execute_ruleset_partial_failure_status() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        // 成功ファイル
        fs::write(src.path().join("ok.txt"), "content").unwrap();
        // 同名ファイルが宛先に存在しかつ overwrite=true で上書き → 成功
        // 失敗を作るには dest の中にサブディレクトリと同名を置く（NotFoundにならないよう）
        // 宛先に同名のディレクトリを作ると、ファイルを上書きしようとして失敗する
        fs::create_dir(dst.path().join("fail.txt")).unwrap();
        fs::write(src.path().join("fail.txt"), "content").unwrap();

        let mut ruleset = create_test_ruleset(src.path(), dst.path());
        ruleset.overwrite = true;

        let result = execute_ruleset(&ruleset, |_, _, _, _| {}, &no_cancel());

        assert_eq!(result.status, ExecutionStatus::PartialFailure);
        assert_eq!(result.succeeded.len(), 1);
        assert_eq!(result.errors.len(), 1);
    }

    // --- テンプレート機能のテスト ---

    #[test]
    fn test_has_template_vars_true() {
        assert!(has_template_vars("D:/sorted/{label}/{author}"));
        assert!(has_template_vars("{category}/file"));
        assert!(has_template_vars("base/{x}"));
    }

    #[test]
    fn test_has_template_vars_false() {
        assert!(!has_template_vars("D:/sorted/static"));
        assert!(!has_template_vars("C:/Users/user/Downloads"));
        assert!(!has_template_vars(""));
    }

    #[test]
    fn test_sanitize_path_component_valid() {
        assert_eq!(sanitize_path_component("valid"), "valid");
        assert_eq!(sanitize_path_component("john_doe"), "john_doe");
        assert_eq!(sanitize_path_component("book123"), "book123");
    }

    #[test]
    fn test_sanitize_path_component_invalid_chars() {
        assert_eq!(sanitize_path_component("sci/fi"), "sci_fi");
        assert_eq!(sanitize_path_component("with:colon"), "with_colon");
        assert_eq!(sanitize_path_component("with\\backslash"), "with_backslash");
        assert_eq!(sanitize_path_component("with*star"), "with_star");
        assert_eq!(sanitize_path_component("with?question"), "with_question");
        assert_eq!(sanitize_path_component("with\"quote"), "with_quote");
        assert_eq!(sanitize_path_component("with<lt>gt"), "with_lt_gt");
        assert_eq!(sanitize_path_component("with|pipe"), "with_pipe");
    }

    #[test]
    fn test_resolve_destination_template_success() {
        use std::collections::HashMap;
        let mut captures = HashMap::new();
        captures.insert("label".to_string(), "book".to_string());
        captures.insert("author".to_string(), "john_doe".to_string());

        let result = resolve_destination_template("D:/sorted/{label}/{author}", &captures);
        assert_eq!(result.unwrap(), "D:/sorted/book/john_doe");
    }

    #[test]
    fn test_resolve_destination_template_missing_var() {
        use std::collections::HashMap;
        let mut captures = HashMap::new();
        captures.insert("label".to_string(), "book".to_string());

        let result = resolve_destination_template("D:/sorted/{label}/{author}", &captures);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("author"));
    }

    #[test]
    fn test_resolve_destination_template_empty_value() {
        use std::collections::HashMap;
        let mut captures = HashMap::new();
        captures.insert("label".to_string(), "".to_string());

        let result = resolve_destination_template("D:/sorted/{label}", &captures);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_destination_template_sanitizes_value() {
        use std::collections::HashMap;
        let mut captures = HashMap::new();
        captures.insert("label".to_string(), "sci/fi".to_string());

        let result = resolve_destination_template("D:/sorted/{label}", &captures);
        assert_eq!(result.unwrap(), "D:/sorted/sci_fi");
    }

    #[test]
    fn test_execute_ruleset_with_template_moves_to_dynamic_dest() {
        let src = tempfile::tempdir().unwrap();
        let dst_base = tempfile::tempdir().unwrap();

        fs::write(src.path().join("(book) [john_doe] ihavepen.zip"), "content").unwrap();
        fs::write(src.path().join("(magazine) [jane] article.zip"), "content2").unwrap();

        let dest_template = format!("{}/{{label}}/{{author}}", dst_base.path().to_str().unwrap());

        let ruleset = Ruleset {
            id: "test-id".to_string(),
            name: "test".to_string(),
            enabled: true,
            source_dir: src.path().to_str().unwrap().to_string(),
            destination_dir: dest_template,
            action: Action::Move,
            overwrite: false,
            filters: Filters {
                extensions: None,
                filename: Some(FilenameFilter {
                    pattern: r"^\((?P<label>[^)]+)\) \[(?P<author>[^]]+)\] .+".to_string(),
                    match_type: MatchType::Regex,
                }),
                created_at: None,
                modified_at: None,
            },
        };

        let result = execute_ruleset(&ruleset, |_, _, _, _| {}, &no_cancel());

        assert_eq!(result.status, ExecutionStatus::Completed);
        assert_eq!(result.succeeded.len(), 2);
        assert_eq!(result.skipped.len(), 0);
        assert_eq!(result.errors.len(), 0);

        assert!(dst_base
            .path()
            .join("book/john_doe/(book) [john_doe] ihavepen.zip")
            .exists());
        assert!(dst_base
            .path()
            .join("magazine/jane/(magazine) [jane] article.zip")
            .exists());
    }

    #[test]
    fn test_execute_ruleset_template_unresolvable_var_skipped() {
        let src = tempfile::tempdir().unwrap();
        let dst_base = tempfile::tempdir().unwrap();

        // regex は label と author を捕捉するが、テンプレートには存在しない {category} を使う
        fs::write(src.path().join("(book) [john_doe] ihavepen.zip"), "content").unwrap();

        let dest_template = format!(
            "{}/{{label}}/{{category}}",
            dst_base.path().to_str().unwrap()
        );

        let ruleset = Ruleset {
            id: "test-id".to_string(),
            name: "test".to_string(),
            enabled: true,
            source_dir: src.path().to_str().unwrap().to_string(),
            destination_dir: dest_template,
            action: Action::Move,
            overwrite: false,
            filters: Filters {
                extensions: None,
                filename: Some(FilenameFilter {
                    pattern: r"^\((?P<label>[^)]+)\) \[(?P<author>[^]]+)\] .+".to_string(),
                    match_type: MatchType::Regex,
                }),
                created_at: None,
                modified_at: None,
            },
        };

        let result = execute_ruleset(&ruleset, |_, _, _, _| {}, &no_cancel());

        assert_eq!(result.skipped.len(), 1);
        assert_eq!(result.succeeded.len(), 0);
        // ファイルは移動されていない
        assert!(src.path().join("(book) [john_doe] ihavepen.zip").exists());
    }

    // --- キャンセルのテスト ---

    #[test]
    fn test_cancel_skips_remaining_files() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();

        // ファイルを3件作成
        fs::write(src.path().join("a.txt"), "content").unwrap();
        fs::write(src.path().join("b.txt"), "content").unwrap();
        fs::write(src.path().join("c.txt"), "content").unwrap();

        // 1件目の処理後にキャンセルフラグをセット
        let cancel = AtomicBool::new(false);
        let call_count = std::sync::atomic::AtomicUsize::new(0);

        let ruleset = create_test_ruleset(src.path(), dst.path());
        let result = execute_ruleset(
            &ruleset,
            |_, _, _, _| {
                let count = call_count.fetch_add(1, Ordering::Relaxed);
                if count == 0 {
                    // 1件目の on_progress が呼ばれた後にキャンセルをセット
                    // (実際にキャンセルチェックは file 処理後に行われる)
                    cancel.store(true, Ordering::SeqCst);
                }
            },
            &cancel,
        );

        // succeeded + skipped + errors = total (3件)
        let total = result.succeeded.len() + result.skipped.len() + result.errors.len();
        assert_eq!(total, 3);
        // 少なくとも1件はスキップ（キャンセル理由）
        assert!(result.skipped.iter().any(|f| f
            .reason
            .as_deref()
            .unwrap_or("")
            .contains("Cancelled")));
    }
}
