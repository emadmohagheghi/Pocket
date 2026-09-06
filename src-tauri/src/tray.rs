use std::sync::Mutex;

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, Wry};

use crate::commands::show_main_window;
use crate::shortcuts::{show_voice_capture, toggle_quick_capture};
use crate::storage::Store;

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;

    TrayIconBuilder::with_id("pocket-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Pocket")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu_event(app, event.id.as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

pub fn refresh_tray(app: &AppHandle) {
    let Some(tray) = app.tray_by_id("pocket-tray") else {
        return;
    };
    match build_menu(app) {
        Ok(menu) => {
            if let Err(e) = tray.set_menu(Some(menu)) {
                eprintln!("[pocket] failed to update tray menu: {e}");
            }
        }
        Err(e) => eprintln!("[pocket] failed to rebuild tray menu: {e}"),
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let show = MenuItem::with_id(app, "show", "Show Pocket", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "quick-capture", "Quick Capture", true, None::<&str>)?;
    let voice = MenuItem::with_id(app, "voice", "Start Voice Recording", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let store: State<Mutex<Store>> = app.state();
    let store = store.lock().unwrap();
    let active_id = store.settings.active_workspace_id.clone();

    let ws_items: Vec<CheckMenuItem<Wry>> = store
        .workspaces
        .iter()
        .map(|w| {
            CheckMenuItem::with_id(
                app,
                format!("ws:{}", w.id),
                w.name.clone(),
                true,
                w.id == active_id,
                None::<&str>,
            )
        })
        .collect::<Result<_, _>>()?;
    drop(store);

    let workspace_submenu = Submenu::with_id_and_items(
        app,
        "workspace-submenu",
        "Workspace",
        true,
        &ws_items
            .iter()
            .map(|i| i as &dyn tauri::menu::IsMenuItem<Wry>)
            .collect::<Vec<_>>(),
    )?;

    Menu::with_items(
        app,
        &[
            &show,
            &capture,
            &voice,
            &PredefinedMenuItem::separator(app)?,
            &workspace_submenu,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )
}

fn handle_menu_event(app: &AppHandle, id: &str) {
    match id {
        "show" => show_main_window(app),
        "quick-capture" => toggle_quick_capture(app),
        "voice" => show_voice_capture(app),
        "settings" => {
            show_main_window(app);
            let _ = app.emit_to("main", "open-settings", ());
        }
        "quit" => app.exit(0),
        other => {
            if let Some(ws_id) = other.strip_prefix("ws:") {
                if crate::commands::set_active_workspace_internal(app, ws_id).is_ok() {
                    refresh_tray(app);
                }
            }
        }
    }
}
