mod local;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            app.manage(local::LocalData::open(dir)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            local::list_anime,
            local::get_anime,
            local::create_anime,
            local::update_anime,
            local::delete_anime,
            local::reorder_anime,
            local::upload_poster,
            local::poster_directory,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run SakuraReel");
}
