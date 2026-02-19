pub mod commands;
pub mod engine;
pub mod filters;
pub mod ruleset;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_rulesets,
            commands::save_ruleset,
            commands::delete_ruleset,
            commands::reorder_rulesets,
            commands::execute_ruleset,
            commands::execute_all,
            commands::undo_file,
            commands::undo_all,
            commands::import_rulesets,
            commands::export_rulesets,
            commands::open_in_explorer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
