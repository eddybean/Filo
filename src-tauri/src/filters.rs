use crate::ruleset::{Filters, MatchType};
use chrono::{DateTime, Local};
use std::collections::HashMap;
use std::path::Path;

/// ファイル名に対してコンパイル済み正規表現を適用し、名前付きキャプチャグループを HashMap で返す。
/// マッチしない場合は空の HashMap を返す。
pub fn extract_named_captures(filename: &str, re: &regex::Regex) -> HashMap<String, String> {
    let caps = match re.captures(filename) {
        Some(c) => c,
        None => return HashMap::new(),
    };
    re.capture_names()
        .flatten()
        .filter_map(|name| {
            caps.name(name)
                .map(|m| (name.to_string(), m.as_str().to_string()))
        })
        .collect()
}

pub fn matches_filters(path: &Path, metadata: &std::fs::Metadata, filters: &Filters) -> bool {
    if let Some(extensions) = &filters.extensions {
        if !match_extensions(path, extensions) {
            return false;
        }
    }

    if let Some(filename_filter) = &filters.filename {
        if !match_filename(path, &filename_filter.pattern, &filename_filter.match_type) {
            return false;
        }
    }

    if let Some(created_at) = &filters.created_at {
        match metadata.created() {
            Ok(created) => {
                let created: DateTime<Local> = created.into();
                if !match_datetime_range(&created, &created_at.start, &created_at.end) {
                    return false;
                }
            }
            Err(_) => return false,
        }
    }

    if let Some(modified_at) = &filters.modified_at {
        match metadata.modified() {
            Ok(modified) => {
                let modified: DateTime<Local> = modified.into();
                if !match_datetime_range(&modified, &modified_at.start, &modified_at.end) {
                    return false;
                }
            }
            Err(_) => return false,
        }
    }

    true
}

fn match_extensions(path: &Path, extensions: &[String]) -> bool {
    let file_ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_lowercase()));

    match file_ext {
        Some(ext) => extensions.iter().any(|e| e.to_lowercase() == ext),
        None => false,
    }
}

fn match_filename(path: &Path, pattern: &str, match_type: &MatchType) -> bool {
    let filename = match path.file_name().and_then(|f| f.to_str()) {
        Some(f) => f,
        None => return false,
    };

    match match_type {
        MatchType::Glob => {
            let glob_pattern = glob::Pattern::new(pattern);
            match glob_pattern {
                Ok(p) => p.matches(filename),
                Err(_) => false,
            }
        }
        MatchType::Regex => {
            let re = regex::Regex::new(pattern);
            match re {
                Ok(r) => r.is_match(filename),
                Err(_) => false,
            }
        }
    }
}

fn match_datetime_range(
    value: &DateTime<Local>,
    start: &Option<String>,
    end: &Option<String>,
) -> bool {
    if let Some(start_str) = start {
        match DateTime::parse_from_rfc3339(start_str) {
            Ok(start_dt) => {
                let start_dt: DateTime<Local> = start_dt.into();
                if value < &start_dt {
                    return false;
                }
            }
            Err(_) => return false,
        }
    }
    if let Some(end_str) = end {
        match DateTime::parse_from_rfc3339(end_str) {
            Ok(end_dt) => {
                let end_dt: DateTime<Local> = end_dt.into();
                if value > &end_dt {
                    return false;
                }
            }
            Err(_) => return false,
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ruleset::{DateTimeRange, FilenameFilter};
    use std::fs;

    fn create_test_file(dir: &Path, name: &str) -> std::path::PathBuf {
        let file_path = dir.join(name);
        fs::write(&file_path, "test content").unwrap();
        file_path
    }

    #[test]
    fn test_match_extensions_jpg() {
        let dir = tempfile::tempdir().unwrap();
        let path = create_test_file(dir.path(), "photo.jpg");
        let meta = fs::metadata(&path).unwrap();

        let filters = Filters {
            extensions: Some(vec![".jpg".to_string(), ".png".to_string()]),
            filename: None,
            created_at: None,
            modified_at: None,
        };

        assert!(matches_filters(&path, &meta, &filters));
    }

    #[test]
    fn test_match_extensions_case_insensitive() {
        let dir = tempfile::tempdir().unwrap();
        let path = create_test_file(dir.path(), "photo.JPG");
        let meta = fs::metadata(&path).unwrap();

        let filters = Filters {
            extensions: Some(vec![".jpg".to_string()]),
            filename: None,
            created_at: None,
            modified_at: None,
        };

        assert!(matches_filters(&path, &meta, &filters));
    }

    #[test]
    fn test_match_extensions_no_match() {
        let dir = tempfile::tempdir().unwrap();
        let path = create_test_file(dir.path(), "document.pdf");
        let meta = fs::metadata(&path).unwrap();

        let filters = Filters {
            extensions: Some(vec![".jpg".to_string(), ".png".to_string()]),
            filename: None,
            created_at: None,
            modified_at: None,
        };

        assert!(!matches_filters(&path, &meta, &filters));
    }

    #[test]
    fn test_match_filename_glob() {
        let dir = tempfile::tempdir().unwrap();
        let path = create_test_file(dir.path(), "screenshot_001.png");
        let meta = fs::metadata(&path).unwrap();

        let filters = Filters {
            extensions: None,
            filename: Some(FilenameFilter {
                pattern: "screenshot_*".to_string(),
                match_type: MatchType::Glob,
            }),
            created_at: None,
            modified_at: None,
        };

        assert!(matches_filters(&path, &meta, &filters));
    }

    #[test]
    fn test_match_filename_glob_no_match() {
        let dir = tempfile::tempdir().unwrap();
        let path = create_test_file(dir.path(), "photo.png");
        let meta = fs::metadata(&path).unwrap();

        let filters = Filters {
            extensions: None,
            filename: Some(FilenameFilter {
                pattern: "screenshot_*".to_string(),
                match_type: MatchType::Glob,
            }),
            created_at: None,
            modified_at: None,
        };

        assert!(!matches_filters(&path, &meta, &filters));
    }

    #[test]
    fn test_match_filename_regex() {
        let dir = tempfile::tempdir().unwrap();
        let path = create_test_file(dir.path(), "IMG_20250101_001.jpg");
        let meta = fs::metadata(&path).unwrap();

        let filters = Filters {
            extensions: None,
            filename: Some(FilenameFilter {
                pattern: r"^IMG_\d{8}_\d+\.jpg$".to_string(),
                match_type: MatchType::Regex,
            }),
            created_at: None,
            modified_at: None,
        };

        assert!(matches_filters(&path, &meta, &filters));
    }

    #[test]
    fn test_match_filename_regex_no_match() {
        let dir = tempfile::tempdir().unwrap();
        let path = create_test_file(dir.path(), "photo.jpg");
        let meta = fs::metadata(&path).unwrap();

        let filters = Filters {
            extensions: None,
            filename: Some(FilenameFilter {
                pattern: r"^IMG_\d{8}_\d+\.jpg$".to_string(),
                match_type: MatchType::Regex,
            }),
            created_at: None,
            modified_at: None,
        };

        assert!(!matches_filters(&path, &meta, &filters));
    }

    #[test]
    fn test_and_combination_extensions_and_filename() {
        let dir = tempfile::tempdir().unwrap();
        let path = create_test_file(dir.path(), "screenshot_001.png");
        let meta = fs::metadata(&path).unwrap();

        let filters = Filters {
            extensions: Some(vec![".png".to_string()]),
            filename: Some(FilenameFilter {
                pattern: "screenshot_*".to_string(),
                match_type: MatchType::Glob,
            }),
            created_at: None,
            modified_at: None,
        };

        assert!(matches_filters(&path, &meta, &filters));

        let filters_no_match = Filters {
            extensions: Some(vec![".png".to_string()]),
            filename: Some(FilenameFilter {
                pattern: "photo_*".to_string(),
                match_type: MatchType::Glob,
            }),
            created_at: None,
            modified_at: None,
        };

        assert!(!matches_filters(&path, &meta, &filters_no_match));
    }

    #[test]
    fn test_match_modified_at_range() {
        let dir = tempfile::tempdir().unwrap();
        let path = create_test_file(dir.path(), "recent.txt");
        let meta = fs::metadata(&path).unwrap();

        let filters = Filters {
            extensions: None,
            filename: None,
            created_at: None,
            modified_at: Some(DateTimeRange {
                start: Some((chrono::Local::now() - chrono::Duration::hours(1)).to_rfc3339()),
                end: None,
            }),
        };

        assert!(matches_filters(&path, &meta, &filters));
    }

    #[test]
    fn test_match_modified_at_out_of_range() {
        let dir = tempfile::tempdir().unwrap();
        let path = create_test_file(dir.path(), "old.txt");
        let meta = fs::metadata(&path).unwrap();

        let filters = Filters {
            extensions: None,
            filename: None,
            created_at: None,
            modified_at: Some(DateTimeRange {
                start: None,
                end: Some((chrono::Local::now() - chrono::Duration::hours(1)).to_rfc3339()),
            }),
        };

        assert!(!matches_filters(&path, &meta, &filters));
    }

    #[test]
    fn test_no_filters_matches_everything() {
        let dir = tempfile::tempdir().unwrap();
        let path = create_test_file(dir.path(), "anything.xyz");
        let meta = fs::metadata(&path).unwrap();

        let filters = Filters {
            extensions: None,
            filename: None,
            created_at: None,
            modified_at: None,
        };

        assert!(matches_filters(&path, &meta, &filters));
    }

    // --- extract_named_captures のテスト ---

    #[test]
    fn test_extract_named_captures_basic() {
        let re = regex::Regex::new(r"^\((?P<label>[^)]+)\) \[(?P<author>[^]]+)\] .+").unwrap();
        let captures = extract_named_captures("(book) [john_doe] ihavepen.zip", &re);
        assert_eq!(captures.get("label").map(|s| s.as_str()), Some("book"));
        assert_eq!(captures.get("author").map(|s| s.as_str()), Some("john_doe"));
    }

    #[test]
    fn test_extract_named_captures_no_match() {
        let re = regex::Regex::new(r"^\((?P<label>[^)]+)\) \[(?P<author>[^]]+)\] .+").unwrap();
        let captures = extract_named_captures("somefile.txt", &re);
        assert!(captures.is_empty());
    }

    #[test]
    fn test_extract_named_captures_unnamed_groups_ignored() {
        let re = regex::Regex::new(r"^(?P<first>[a-z]+)_([a-z]+)$").unwrap();
        let captures = extract_named_captures("hello_world", &re);
        assert_eq!(captures.len(), 1);
        assert_eq!(captures.get("first").map(|s| s.as_str()), Some("hello"));
    }

    #[test]
    fn test_extract_named_captures_multiple_groups() {
        let re = regex::Regex::new(r"^(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})_.+").unwrap();
        let captures = extract_named_captures("2025-01-15_report.pdf", &re);
        assert_eq!(captures.get("year").map(|s| s.as_str()), Some("2025"));
        assert_eq!(captures.get("month").map(|s| s.as_str()), Some("01"));
        assert_eq!(captures.get("day").map(|s| s.as_str()), Some("15"));
    }

    // --- match_datetime_range のパースエラーテスト ---

    #[test]
    fn test_match_datetime_range_invalid_start_returns_false() {
        let dir = tempfile::tempdir().unwrap();
        let path = create_test_file(dir.path(), "file.txt");
        let meta = fs::metadata(&path).unwrap();

        let filters = Filters {
            extensions: None,
            filename: None,
            created_at: None,
            modified_at: Some(DateTimeRange {
                start: Some("invalid-date".to_string()),
                end: None,
            }),
        };

        assert!(!matches_filters(&path, &meta, &filters));
    }

    #[test]
    fn test_match_datetime_range_invalid_end_returns_false() {
        let dir = tempfile::tempdir().unwrap();
        let path = create_test_file(dir.path(), "file.txt");
        let meta = fs::metadata(&path).unwrap();

        let filters = Filters {
            extensions: None,
            filename: None,
            created_at: None,
            modified_at: Some(DateTimeRange {
                start: None,
                end: Some("not-a-date".to_string()),
            }),
        };

        assert!(!matches_filters(&path, &meta, &filters));
    }
}
