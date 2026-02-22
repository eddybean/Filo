use chrono::DateTime;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Move,
    Copy,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MatchType {
    Glob,
    Regex,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FilenameFilter {
    pub pattern: String,
    pub match_type: MatchType,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DateTimeRange {
    pub start: Option<String>,
    pub end: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Filters {
    pub extensions: Option<Vec<String>>,
    pub filename: Option<FilenameFilter>,
    pub created_at: Option<DateTimeRange>,
    pub modified_at: Option<DateTimeRange>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Ruleset {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub source_dir: String,
    pub destination_dir: String,
    pub action: Action,
    pub overwrite: bool,
    pub filters: Filters,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RulesetFile {
    pub version: u32,
    pub rulesets: Vec<Ruleset>,
}

#[derive(Debug, thiserror::Error)]
pub enum RulesetError {
    #[error("YAML error: {0}")]
    Yaml(#[from] serde_yaml::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Validation error: {0}")]
    Validation(String),
}

/// `destination_dir` にテンプレート変数 `{xxx}` が含まれているか判定する。
fn has_template_vars(s: &str) -> bool {
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '{' {
            if chars.peek().is_some() {
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

impl Filters {
    pub fn has_at_least_one(&self) -> bool {
        self.extensions.as_ref().is_some_and(|e| !e.is_empty())
            || self.filename.is_some()
            || self.created_at.is_some()
            || self.modified_at.is_some()
    }
}

fn validate_datetime_range(range: &DateTimeRange) -> Result<(), RulesetError> {
    if let Some(start) = &range.start {
        DateTime::parse_from_rfc3339(start).map_err(|_| {
            RulesetError::Validation(format!("invalid datetime format: '{}'", start))
        })?;
    }
    if let Some(end) = &range.end {
        DateTime::parse_from_rfc3339(end)
            .map_err(|_| RulesetError::Validation(format!("invalid datetime format: '{}'", end)))?;
    }
    Ok(())
}

impl Ruleset {
    pub fn validate(&self) -> Result<(), RulesetError> {
        if self.name.trim().is_empty() {
            return Err(RulesetError::Validation("name is required".into()));
        }
        if self.source_dir.trim().is_empty() {
            return Err(RulesetError::Validation("source_dir is required".into()));
        }
        if self.destination_dir.trim().is_empty() {
            return Err(RulesetError::Validation(
                "destination_dir is required".into(),
            ));
        }
        if !self.filters.has_at_least_one() {
            return Err(RulesetError::Validation(
                "at least one filter is required".into(),
            ));
        }
        // テンプレート変数がある場合は正規表現フィルタが必須
        if has_template_vars(&self.destination_dir) {
            let is_regex = self
                .filters
                .filename
                .as_ref()
                .map(|f| f.match_type == MatchType::Regex)
                .unwrap_or(false);
            if !is_regex {
                return Err(RulesetError::Validation(
                    "destination_dir contains template variables but filename filter is not regex"
                        .into(),
                ));
            }
        }
        // datetime フィルタの形式を検証
        if let Some(created_at) = &self.filters.created_at {
            validate_datetime_range(created_at)?;
        }
        if let Some(modified_at) = &self.filters.modified_at {
            validate_datetime_range(modified_at)?;
        }
        Ok(())
    }

    pub fn source_path(&self) -> PathBuf {
        PathBuf::from(&self.source_dir)
    }

    pub fn destination_path(&self) -> PathBuf {
        PathBuf::from(&self.destination_dir)
    }
}

impl RulesetFile {
    pub fn from_yaml(yaml: &str) -> Result<Self, RulesetError> {
        let file: RulesetFile = serde_yaml::from_str(yaml)?;
        Ok(file)
    }

    pub fn to_yaml(&self) -> Result<String, RulesetError> {
        let yaml = serde_yaml::to_string(self)?;
        Ok(yaml)
    }

    pub fn load(path: &std::path::Path) -> Result<Self, RulesetError> {
        let content = std::fs::read_to_string(path)?;
        Self::from_yaml(&content)
    }

    pub fn save(&self, path: &std::path::Path) -> Result<(), RulesetError> {
        let yaml = self.to_yaml()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, yaml)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_ruleset() -> Ruleset {
        Ruleset {
            id: "550e8400-e29b-41d4-a716-446655440000".to_string(),
            name: "画像ファイルを整理".to_string(),
            enabled: true,
            source_dir: "C:/Users/user/Downloads".to_string(),
            destination_dir: "C:/Users/user/Pictures/sorted".to_string(),
            action: Action::Move,
            overwrite: false,
            filters: Filters {
                extensions: Some(vec![".jpg".to_string(), ".png".to_string()]),
                filename: Some(FilenameFilter {
                    pattern: "screenshot_*".to_string(),
                    match_type: MatchType::Glob,
                }),
                created_at: None,
                modified_at: None,
            },
        }
    }

    #[test]
    fn test_serialize_deserialize_yaml_roundtrip() {
        let file = RulesetFile {
            version: 1,
            rulesets: vec![sample_ruleset()],
        };

        let yaml = file.to_yaml().unwrap();
        let parsed = RulesetFile::from_yaml(&yaml).unwrap();
        assert_eq!(file, parsed);
    }

    #[test]
    fn test_deserialize_from_spec_yaml() {
        let yaml = r#"
version: 1
rulesets:
  - id: "550e8400-e29b-41d4-a716-446655440000"
    name: "画像ファイルを整理"
    enabled: true
    source_dir: "C:/Users/user/Downloads"
    destination_dir: "C:/Users/user/Pictures/sorted"
    action: move
    overwrite: false
    filters:
      extensions:
        - ".jpg"
        - ".png"
        - ".gif"
      filename:
        pattern: "screenshot_*"
        match_type: glob
      created_at:
        start: "2025-01-01T00:00:00+09:00"
        end: null
      modified_at: null
"#;
        let file = RulesetFile::from_yaml(yaml).unwrap();
        assert_eq!(file.version, 1);
        assert_eq!(file.rulesets.len(), 1);

        let rs = &file.rulesets[0];
        assert_eq!(rs.name, "画像ファイルを整理");
        assert_eq!(rs.action, Action::Move);
        assert!(!rs.overwrite);
        assert_eq!(
            rs.filters.extensions,
            Some(vec![
                ".jpg".to_string(),
                ".png".to_string(),
                ".gif".to_string()
            ])
        );
        assert!(rs.filters.filename.is_some());
        assert!(rs.filters.created_at.is_some());
        assert!(rs.filters.modified_at.is_none());
    }

    #[test]
    fn test_action_copy_serialization() {
        let yaml = r#"
version: 1
rulesets:
  - id: "test-id"
    name: "copy test"
    enabled: true
    source_dir: "/src"
    destination_dir: "/dst"
    action: copy
    overwrite: true
    filters:
      extensions:
        - ".log"
"#;
        let file = RulesetFile::from_yaml(yaml).unwrap();
        assert_eq!(file.rulesets[0].action, Action::Copy);
        assert!(file.rulesets[0].overwrite);
    }

    #[test]
    fn test_validate_valid_ruleset() {
        let rs = sample_ruleset();
        assert!(rs.validate().is_ok());
    }

    #[test]
    fn test_validate_empty_name() {
        let mut rs = sample_ruleset();
        rs.name = "".to_string();
        assert!(rs.validate().is_err());
    }

    #[test]
    fn test_validate_empty_source_dir() {
        let mut rs = sample_ruleset();
        rs.source_dir = "".to_string();
        assert!(rs.validate().is_err());
    }

    #[test]
    fn test_validate_empty_destination_dir() {
        let mut rs = sample_ruleset();
        rs.destination_dir = "".to_string();
        assert!(rs.validate().is_err());
    }

    #[test]
    fn test_validate_no_filters() {
        let mut rs = sample_ruleset();
        rs.filters = Filters {
            extensions: None,
            filename: None,
            created_at: None,
            modified_at: None,
        };
        assert!(rs.validate().is_err());
    }

    #[test]
    fn test_validate_empty_extensions_list() {
        let mut rs = sample_ruleset();
        rs.filters = Filters {
            extensions: Some(vec![]),
            filename: None,
            created_at: None,
            modified_at: None,
        };
        assert!(rs.validate().is_err());
    }

    #[test]
    fn test_file_save_and_load() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test-rules.yaml");

        let file = RulesetFile {
            version: 1,
            rulesets: vec![sample_ruleset()],
        };

        file.save(&path).unwrap();
        let loaded = RulesetFile::load(&path).unwrap();
        assert_eq!(file, loaded);
    }

    #[test]
    fn test_filters_has_at_least_one() {
        let empty = Filters {
            extensions: None,
            filename: None,
            created_at: None,
            modified_at: None,
        };
        assert!(!empty.has_at_least_one());

        let with_ext = Filters {
            extensions: Some(vec![".txt".to_string()]),
            ..empty.clone()
        };
        assert!(with_ext.has_at_least_one());
    }

    // --- テンプレート変数バリデーションのテスト ---

    #[test]
    fn test_validate_template_with_regex_ok() {
        let mut rs = sample_ruleset();
        rs.destination_dir = "D:/sorted/{label}/{author}".to_string();
        rs.filters.filename = Some(FilenameFilter {
            pattern: r"^\((?P<label>[^)]+)\) \[(?P<author>[^]]+)\] .+".to_string(),
            match_type: MatchType::Regex,
        });
        assert!(rs.validate().is_ok());
    }

    #[test]
    fn test_validate_template_with_glob_fails() {
        let mut rs = sample_ruleset();
        rs.destination_dir = "D:/sorted/{label}".to_string();
        rs.filters.filename = Some(FilenameFilter {
            pattern: "*.zip".to_string(),
            match_type: MatchType::Glob,
        });
        assert!(rs.validate().is_err());
    }

    #[test]
    fn test_validate_template_without_filename_filter_fails() {
        let mut rs = sample_ruleset();
        rs.destination_dir = "D:/sorted/{label}".to_string();
        rs.filters = Filters {
            extensions: Some(vec![".zip".to_string()]),
            filename: None,
            created_at: None,
            modified_at: None,
        };
        assert!(rs.validate().is_err());
    }

    #[test]
    fn test_validate_no_template_with_glob_ok() {
        // テンプレートなしの従来ルールセットは変更なし
        let rs = sample_ruleset();
        assert!(rs.validate().is_ok());
    }
}
