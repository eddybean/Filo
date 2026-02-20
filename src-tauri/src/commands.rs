use crate::engine::{self, ExecutionResult, UndoRequest};
use crate::ruleset::{Ruleset, RulesetFile};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Emitter;
use uuid::Uuid;

#[derive(Clone, Serialize)]
struct ExecutionProgressPayload {
    ruleset_name: String,
    filename: String,
}

static RULESETS: Mutex<Option<(PathBuf, RulesetFile)>> = Mutex::new(None);

fn default_rulesets_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("filo")
        .join("rulesets")
        .join("filo-rules.yaml")
}

fn load_rulesets() -> Result<(PathBuf, RulesetFile), String> {
    let mut guard = RULESETS.lock().map_err(|e| e.to_string())?;
    if let Some(ref data) = *guard {
        return Ok(data.clone());
    }

    let path = default_rulesets_path();
    let file = if path.exists() {
        RulesetFile::load(&path).map_err(|e| e.to_string())?
    } else {
        RulesetFile {
            version: 1,
            rulesets: Vec::new(),
        }
    };

    *guard = Some((path.clone(), file.clone()));
    Ok((path, file))
}

fn save_rulesets_to_disk(path: &Path, file: &RulesetFile) -> Result<(), String> {
    file.save(path).map_err(|e| e.to_string())
}

fn update_and_save<F>(f: F) -> Result<(), String>
where
    F: FnOnce(&mut RulesetFile),
{
    // Ensure rulesets are loaded first
    {
        let guard = RULESETS.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            drop(guard);
            load_rulesets()?;
        }
    }

    let mut guard = RULESETS.lock().map_err(|e| e.to_string())?;
    let (path, file) = guard.as_mut().unwrap();
    f(file);
    save_rulesets_to_disk(path, file)
}

#[tauri::command]
pub fn get_rulesets() -> Result<Vec<Ruleset>, String> {
    let (_, file) = load_rulesets()?;
    Ok(file.rulesets)
}

#[tauri::command]
pub fn save_ruleset(mut ruleset: Ruleset) -> Result<(), String> {
    ruleset.validate().map_err(|e| e.to_string())?;

    if ruleset.id.is_empty() {
        ruleset.id = Uuid::new_v4().to_string();
    }

    update_and_save(|file| {
        if let Some(existing) = file.rulesets.iter_mut().find(|r| r.id == ruleset.id) {
            *existing = ruleset;
        } else {
            file.rulesets.push(ruleset);
        }
    })
}

#[tauri::command]
pub fn delete_ruleset(id: String) -> Result<(), String> {
    update_and_save(|file| {
        file.rulesets.retain(|r| r.id != id);
    })
}

#[tauri::command]
pub fn reorder_rulesets(ids: Vec<String>) -> Result<(), String> {
    update_and_save(|file| {
        let mut reordered = Vec::with_capacity(ids.len());
        for id in &ids {
            if let Some(rs) = file.rulesets.iter().find(|r| &r.id == id) {
                reordered.push(rs.clone());
            }
        }
        file.rulesets = reordered;
    })
}

#[tauri::command]
pub fn execute_ruleset(app: tauri::AppHandle, id: String) -> Result<ExecutionResult, String> {
    let (_, file) = load_rulesets()?;
    let ruleset = file
        .rulesets
        .iter()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("Ruleset not found: {}", id))?;
    let ruleset_name = ruleset.name.clone();

    Ok(engine::execute_ruleset(ruleset, |filename| {
        let _ = app.emit(
            "execution-progress",
            ExecutionProgressPayload {
                ruleset_name: ruleset_name.clone(),
                filename: filename.to_string(),
            },
        );
    }))
}

#[tauri::command]
pub fn execute_all(app: tauri::AppHandle) -> Result<Vec<ExecutionResult>, String> {
    let (_, file) = load_rulesets()?;
    let results: Vec<ExecutionResult> = file
        .rulesets
        .iter()
        .filter(|r| r.enabled)
        .map(|ruleset| {
            let ruleset_name = ruleset.name.clone();
            engine::execute_ruleset(ruleset, |filename| {
                let _ = app.emit(
                    "execution-progress",
                    ExecutionProgressPayload {
                        ruleset_name: ruleset_name.clone(),
                        filename: filename.to_string(),
                    },
                );
            })
        })
        .collect();

    Ok(results)
}

#[tauri::command]
pub fn undo_file(source: String, dest: String) -> Result<(), String> {
    engine::undo_file_move(Path::new(&source), Path::new(&dest))
}

#[tauri::command]
pub fn undo_all(files: Vec<UndoRequest>) -> Result<Vec<Result<(), String>>, String> {
    let results = files
        .iter()
        .map(|req| engine::undo_file_move(&req.source_path, &req.destination_path))
        .collect();

    Ok(results)
}

#[tauri::command]
pub fn import_rulesets(path: String) -> Result<Vec<Ruleset>, String> {
    let file = RulesetFile::load(Path::new(&path)).map_err(|e| e.to_string())?;
    Ok(file.rulesets)
}

#[tauri::command]
pub fn export_rulesets(path: String) -> Result<(), String> {
    let (_, file) = load_rulesets()?;
    file.save(Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<(), String> {
    std::process::Command::new("explorer.exe")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
