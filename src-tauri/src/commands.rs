use std::sync::atomic::Ordering;
use std::sync::Mutex;

use serde::Serialize;
use std::str::FromStr;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

use crate::error::{AppError, AppResult};
use crate::fsutil;
use crate::models::*;
use crate::shortcuts::{
    apply_registrations, validate_shortcut_string, ShortcutConfig, ShortcutShared,
};
use crate::storage::Store;

/// Snapshot emitted to the frontend whenever settings change.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateChangedPayload {
    pub settings: Settings,
    pub workspaces: Vec<WorkspaceInfo>,
}

fn state_changed(app: &AppHandle) {
    let payload = {
        let store = app.state::<Mutex<Store>>();
        let store = store.lock().unwrap();
        StateChangedPayload {
            settings: store.settings.clone(),
            workspaces: store.all_workspace_infos(),
        }
    };
    let _ = app.emit("state-changed", payload);
}

fn items_changed(app: &AppHandle, ws_id: &str) {
    let payload = {
        let store = app.state::<Mutex<Store>>();
        let store = store.lock().unwrap();
        store.workspace_data(ws_id).cloned()
    };
    if let Ok(data) = payload {
        let _ = app.emit(
            "items-changed",
            serde_json::json!({ "workspaceId": ws_id, "data": data }),
        );
        // Sidebar counts live on the workspace infos; refresh them too.
        state_changed(app);
    }
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

#[tauri::command]
pub fn get_state(app: AppHandle) -> AppResult<InitialState> {
    let store = app.state::<Mutex<Store>>();
    let store = store.lock().unwrap();
    Ok(InitialState {
        settings: store.settings.clone(),
        workspaces: store.all_workspace_infos(),
        storage: storage_info(&store),
    })
}

fn storage_info(store: &Store) -> StorageInfo {
    StorageInfo {
        data_dir: store.data_dir.display().to_string(),
        size_bytes: fsutil::dir_size(&store.data_dir),
        uses_fallback_location: store.uses_fallback_location,
    }
}

#[tauri::command]
pub fn get_storage_info(app: AppHandle) -> AppResult<StorageInfo> {
    let store = app.state::<Mutex<Store>>();
    let store = store.lock().unwrap();
    Ok(storage_info(&store))
}

#[tauri::command]
pub fn open_data_folder(app: AppHandle) -> AppResult<()> {
    let dir = {
        let store = app.state::<Mutex<Store>>();
        let store = store.lock().unwrap();
        store.data_dir.clone()
    };
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppError::Storage(format!("could not open data folder: {e}")))?;
    Ok(())
}

// ---------------------------------------------------------------- workspaces

#[tauri::command]
pub fn create_workspace(app: AppHandle, name: String) -> AppResult<WorkspaceInfo> {
    let info = {
        let store = app.state::<Mutex<Store>>();
        let mut store = store.lock().unwrap();
        store.create_workspace(&name)?
    };
    state_changed(&app);
    crate::tray::refresh_tray(&app);
    Ok(info)
}

#[tauri::command]
pub fn rename_workspace(
    app: AppHandle,
    workspace_id: String,
    name: String,
) -> AppResult<WorkspaceInfo> {
    let info = {
        let store = app.state::<Mutex<Store>>();
        let mut store = store.lock().unwrap();
        store.rename_workspace(&workspace_id, &name)?
    };
    state_changed(&app);
    crate::tray::refresh_tray(&app);
    Ok(info)
}

#[tauri::command]
pub fn get_workspace_counts(app: AppHandle, workspace_id: String) -> AppResult<Counts> {
    let store = app.state::<Mutex<Store>>();
    let store = store.lock().unwrap();
    store.counts(&workspace_id)
}

#[tauri::command]
pub fn delete_workspace(app: AppHandle, workspace_id: String) -> AppResult<()> {
    crate::shortcuts::diag_log(&format!("delete: command entered ws={workspace_id}"));
    {
        let store = app.state::<Mutex<Store>>();
        let mut store = store.lock().unwrap();
        crate::shortcuts::diag_log("delete: store lock acquired");
        store.delete_workspace(&workspace_id)?;
        crate::shortcuts::diag_log("delete: store.delete_workspace returned Ok");
    }
    crate::shortcuts::diag_log("delete: emitting state-changed");
    state_changed(&app);
    crate::shortcuts::diag_log("delete: refreshing tray");
    crate::tray::refresh_tray(&app);
    crate::shortcuts::diag_log("delete: emitting items-changed");
    // NOTE: bind the id to an owned String FIRST so the store guard is
    // dropped before items_changed() takes the lock again. Passing
    // `&...lock().unwrap().settings...` inline here used to hold the guard
    // across the call and deadlock the store mutex forever (the UI then sat
    // on "Deleting…" and every later command hung too).
    let active_id = {
        app.state::<Mutex<Store>>()
            .lock()
            .unwrap()
            .settings
            .active_workspace_id
            .clone()
    };
    items_changed(&app, &active_id);
    crate::shortcuts::diag_log("delete: command returning Ok");
    Ok(())
}

/// Internal helper used by the tray menu (not exposed as a command).
pub fn set_active_workspace_internal(app: &AppHandle, workspace_id: &str) -> AppResult<()> {
    {
        let store = app.state::<Mutex<Store>>();
        let mut store = store.lock().unwrap();
        store.set_active_workspace(workspace_id)?;
    }
    state_changed(app);
    Ok(())
}

#[tauri::command]
pub fn set_active_workspace(app: AppHandle, workspace_id: String) -> AppResult<()> {
    set_active_workspace_internal(&app, &workspace_id)?;
    crate::tray::refresh_tray(&app);
    Ok(())
}

// --------------------------------------------------------------------- items

#[tauri::command]
pub fn get_items(app: AppHandle, workspace_id: String) -> AppResult<WorkspaceData> {
    let store = app.state::<Mutex<Store>>();
    let store = store.lock().unwrap();
    Ok(store.workspace_data(&workspace_id)?.clone())
}

#[tauri::command]
pub fn create_item(app: AppHandle, workspace_id: String, item: NewItem) -> AppResult<Item> {
    crate::shortcuts::debug_log(&format!(
        "create_item ws={workspace_id} type={:?} content_len={}",
        item.item_type,
        item.content.len()
    ));
    let created = {
        let store = app.state::<Mutex<Store>>();
        let mut store = store.lock().unwrap();
        store.create_item(&workspace_id, item)
    };
    match &created {
        Ok(i) => crate::shortcuts::debug_log(&format!("create_item ok id={}", i.id)),
        Err(e) => crate::shortcuts::debug_log(&format!("create_item FAILED: {e}")),
    }
    items_changed(&app, &workspace_id);
    created
}

#[tauri::command]
pub fn update_item(
    app: AppHandle,
    workspace_id: String,
    item_id: String,
    patch: ItemPatch,
) -> AppResult<Item> {
    let updated = {
        let store = app.state::<Mutex<Store>>();
        let mut store = store.lock().unwrap();
        store.update_item(&workspace_id, &item_id, patch)?
    };
    items_changed(&app, &workspace_id);
    Ok(updated)
}

#[tauri::command]
pub fn delete_item(app: AppHandle, workspace_id: String, item_id: String) -> AppResult<()> {
    {
        let store = app.state::<Mutex<Store>>();
        let mut store = store.lock().unwrap();
        store.delete_item(&workspace_id, &item_id)?;
    }
    items_changed(&app, &workspace_id);
    Ok(())
}

#[tauri::command]
pub fn search(app: AppHandle, workspace_id: String, query: String) -> AppResult<Vec<SearchHit>> {
    let store = app.state::<Mutex<Store>>();
    let store = store.lock().unwrap();
    store.search(&workspace_id, &query)
}

// ---------------------------------------------------------------- recordings

#[tauri::command]
pub fn save_recording(app: AppHandle, request: tauri::ipc::Request) -> AppResult<Recording> {
    // Audio bytes travel as the raw IPC body; metadata rides in headers.
    let headers = request.headers();
    let header_str = |key: &str| -> Option<String> {
        headers
            .get(key)
            .and_then(|v| v.to_str().ok())
            .map(|v| percent_decode(v.to_string()))
    };
    let workspace_id = header_str("x-pocket-workspace")
        .ok_or_else(|| AppError::Invalid("missing workspace".into()))?;
    let name = header_str("x-pocket-name").unwrap_or_else(|| "Voice note".into());
    let duration_ms: u64 = header_str("x-pocket-duration")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let bytes: Vec<u8> = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => b.clone(),
        // When the webview falls back to postMessage IPC, binary payloads
        // arrive JSON-serialized as a number array. Accept both.
        tauri::ipc::InvokeBody::Json(v) => {
            let arr = v
                .as_array()
                .ok_or_else(|| AppError::Recording("expected raw audio body".into()))?;
            if arr.len() > 100 * 1024 * 1024 {
                return Err(AppError::Recording("recording too large".into()));
            }
            let mut bytes = Vec::with_capacity(arr.len());
            for n in arr {
                let b = u8::try_from(n.as_u64().unwrap_or(256))
                    .map_err(|_| AppError::Recording("invalid audio byte".into()))?;
                bytes.push(b);
            }
            crate::shortcuts::debug_log(&format!(
                "save_recording: body arrived as JSON array ({} bytes) — postMessage IPC fallback active",
                bytes.len()
            ));
            bytes
        }
    };
    crate::shortcuts::debug_log(&format!(
        "save_recording ws={workspace_id} name='{name}' duration={duration_ms}ms bytes={}",
        bytes.len()
    ));
    let result = {
        let store = app.state::<Mutex<Store>>();
        let mut store = store.lock().unwrap();
        store.save_recording(&workspace_id, &name, duration_ms, &bytes)
    };
    match &result {
        Ok(rec) => {
            let path = {
                let store = app.state::<Mutex<Store>>();
                let store = store.lock().unwrap();
                store.recording_path(&workspace_id, &rec.file)
            };
            crate::shortcuts::debug_log(&format!(
                "save_recording ok -> {} ({} bytes on disk: {})",
                path.display(),
                std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0),
                path.exists()
            ));
        }
        Err(e) => crate::shortcuts::debug_log(&format!("save_recording FAILED: {e}")),
    }
    let rec = result?;
    items_changed(&app, &workspace_id);
    Ok(rec)
}

/// Frontend diagnostics channel (active with POCKET_DEBUG=1).
#[tauri::command]
pub fn frontend_log(message: String) {
    crate::shortcuts::debug_log(&format!("[web] {message}"));
}

fn percent_decode(input: String) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

#[tauri::command]
pub fn rename_recording(
    app: AppHandle,
    workspace_id: String,
    recording_id: String,
    name: String,
) -> AppResult<Recording> {
    let rec = {
        let store = app.state::<Mutex<Store>>();
        let mut store = store.lock().unwrap();
        store.rename_recording(&workspace_id, &recording_id, &name)?
    };
    items_changed(&app, &workspace_id);
    Ok(rec)
}

#[tauri::command]
pub fn delete_recording(
    app: AppHandle,
    workspace_id: String,
    recording_id: String,
) -> AppResult<()> {
    {
        let store = app.state::<Mutex<Store>>();
        let mut store = store.lock().unwrap();
        store.delete_recording(&workspace_id, &recording_id)?;
    }
    items_changed(&app, &workspace_id);
    Ok(())
}

// ----------------------------------------------------------------- clipboard

#[tauri::command]
pub fn copy_to_clipboard(app: AppHandle, text: String) -> AppResult<()> {
    app.clipboard()
        .write_text(text)
        .map_err(|e| AppError::Invalid(format!("could not copy: {e}")))?;
    Ok(())
}

// ------------------------------------------------------------------ settings

#[tauri::command]
pub fn update_settings(app: AppHandle, patch: SettingsPatch) -> AppResult<Settings> {
    let (settings, autostart_changed) = {
        let store = app.state::<Mutex<Store>>();
        let mut guard = store.lock().unwrap();
        let s = &mut guard.settings;
        if let Some(v) = patch.launch_on_startup {
            if s.launch_on_startup != v {
                s.launch_on_startup = v;
            }
        }
        if let Some(v) = patch.start_minimized {
            s.start_minimized = v;
        }
        if let Some(v) = patch.close_to_tray {
            s.close_to_tray = v;
        }
        if let Some(v) = patch.gaming_detection_enabled {
            s.gaming_detection_enabled = v;
        }
        if let Some(v) = patch.theme {
            if matches!(v.as_str(), "system" | "light" | "dark") {
                s.theme = v;
            } else {
                return Err(AppError::Invalid(
                    "theme must be system, light or dark".into(),
                ));
            }
        }
        let settings = s.clone();
        guard.persist_settings();
        (settings, patch.launch_on_startup.is_some())
    };
    if autostart_changed {
        apply_autostart(&app);
    }
    state_changed(&app);
    Ok(settings)
}

/// Sync the OS autostart registration with the persisted setting.
pub fn apply_autostart(app: &AppHandle) {
    use tauri_plugin_autostart::ManagerExt;
    let enabled = {
        let store = app.state::<Mutex<Store>>();
        let guard = store.lock().unwrap();
        guard.settings.launch_on_startup
    };
    let autolaunch = app.autolaunch();
    let is_enabled = autolaunch.is_enabled().unwrap_or(false);
    let result = if enabled && !is_enabled {
        autolaunch.enable()
    } else if !enabled && is_enabled {
        autolaunch.disable()
    } else {
        Ok(())
    };
    if let Err(e) = result {
        eprintln!("[pocket] failed to update autostart: {e}");
    }
}

#[tauri::command]
pub fn set_shortcut(app: AppHandle, kind: String, value: Option<String>) -> AppResult<Settings> {
    let value = match kind.as_str() {
        "quickCapture" => Some(value.unwrap_or_else(|| "DoubleShift".into())),
        "voice" => value,
        _ => {
            return Err(AppError::Invalid(
                "shortcut kind must be quickCapture or voice".into(),
            ))
        }
    };

    if let Some(v) = &value {
        validate_shortcut_string(v)?;
    }

    // Dry-run: try to register the new accelerator before committing anything,
    // so a conflict with another application leaves settings untouched.
    if let Some(v) = &value {
        if v != "DoubleShift" {
            test_register(app.clone(), v)?;
        }
    }

    let settings = {
        let store = app.state::<Mutex<Store>>();
        let mut store = store.lock().unwrap();
        match kind.as_str() {
            "quickCapture" => {
                store.settings.quick_capture_shortcut =
                    value.clone().unwrap_or_else(|| "DoubleShift".into())
            }
            "voice" => store.settings.voice_shortcut = value,
            _ => unreachable!(),
        }
        store.persist_settings();
        store.settings.clone()
    };
    {
        let shared = app.state::<ShortcutShared>();
        let mut cfg = shared.config.lock().unwrap_or_else(|e| e.into_inner());
        *cfg = ShortcutConfig::from_settings(&settings);
    }
    apply_registrations(&app);
    state_changed(&app);
    Ok(settings)
}

fn test_register(app: AppHandle, accel: &str) -> AppResult<()> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    let shortcut = Shortcut::from_str(accel)
        .map_err(|e| AppError::Invalid(format!("invalid shortcut: {e}")))?;
    let gs = app.global_shortcut();
    gs.register(shortcut)
        .map_err(|e| AppError::ShortcutUnavailable(e.to_string()))?;
    let _ = gs.unregister(shortcut);
    Ok(())
}

#[tauri::command]
pub fn get_gaming_state(app: AppHandle) -> AppResult<bool> {
    let shared = app.state::<ShortcutShared>();
    Ok(shared.gaming.load(Ordering::Relaxed))
}

/// Opens the quick-capture window from the main window ("text" or "voice").
#[tauri::command]
pub fn open_capture(app: AppHandle, mode: Option<String>) -> AppResult<()> {
    if mode.as_deref() == Some("voice") {
        crate::shortcuts::show_voice_capture(&app);
    } else {
        crate::shortcuts::toggle_quick_capture(&app);
    }
    Ok(())
}

/// Opens a captured link in the default browser.
#[tauri::command]
pub fn open_url(app: AppHandle, url: String) -> AppResult<()> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(AppError::Invalid("only http(s) links can be opened".into()));
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AppError::Invalid(format!("could not open link: {e}")))?;
    Ok(())
}
