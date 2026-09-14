//! Minimal heads-up notification: a "Captured" pill shown at the
//! bottom-center of the user's active monitor when a capture is triggered by
//! the global hotkeys. Never shown for captures made inside the app itself.
//!
//! The HUD window is pre-created at startup (see tauri.conf.json) and stays
//! loaded for the whole session: the pill div only renders when a message
//! arrives, so the empty window is fully transparent and invisible. This
//! keeps the pill's latency at ~zero — creating a fresh WebView per capture
//! added hundreds of milliseconds. The window ignores cursor events so it
//! never blocks clicks.

use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{AppHandle, Emitter, Manager};

const AUTO_HIDE_MS: u64 = 1500;
/// Distance from the bottom of the monitor's work area.
const BOTTOM_MARGIN_PX: i32 = 48;

static HUD_SEQ: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HudMessage<'a> {
    text: &'a str,
    sticky: bool,
}

/// Show the pill on the monitor that owns the foreground window (the monitor
/// the user is actually working on). Any pending auto-hide is invalidated.
pub fn show_hud(app: &AppHandle, text: &str, _sticky: bool) {
    let Some(win) = app.get_webview_window("hud") else {
        crate::shortcuts::diag_log("hud: window not found!");
        return;
    };
    let seq = HUD_SEQ.fetch_add(1, Ordering::AcqRel) + 1;
    position_on_active_monitor(&win);
    make_topmost(&win);
    // Emit twice: the very first capture can race the webview's listener
    // registration on a cold start.
    let _ = app.emit_to("hud", "hud-message", HudMessage { text, sticky: false });
    let handle = app.clone();
    let text_owned = text.to_string();
    std::thread::Builder::new()
        .name("hud-emit-retry".into())
        .spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(250));
            let _ = handle.emit_to(
                "hud",
                "hud-message",
                HudMessage {
                    text: &text_owned,
                    sticky: false,
                },
            );
        })
        .ok();

    // Auto-hide: clearing the text unmounts the pill, leaving the window
    // fully transparent again.
    let handle = app.clone();
    std::thread::Builder::new()
        .name("hud-auto-hide".into())
        .spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(AUTO_HIDE_MS));
            if HUD_SEQ.load(Ordering::Acquire) != seq {
                return; // a newer show owns the pill
            }
            let _ = handle.emit_to(
                "hud",
                "hud-message",
                HudMessage {
                    text: "",
                    sticky: false,
                },
            );
        })
        .ok();
}

#[cfg(windows)]
fn make_topmost(win: &tauri::WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    };
    let Ok(hwnd) = win.hwnd() else {
        return;
    };
    let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE;
    unsafe {
        let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, flags);
    }
}

#[cfg(not(windows))]
fn make_topmost(_win: &tauri::WebviewWindow) {}

#[cfg(windows)]
fn position_on_active_monitor(win: &tauri::WebviewWindow) {
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    unsafe {
        let hwnd = GetForegroundWindow();
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(monitor, &mut info).as_bool() {
            place_bottom_center(win, &info.rcWork);
            return;
        }
    }
    let _ = win.center();
}

#[cfg(windows)]
fn place_bottom_center(win: &tauri::WebviewWindow, work: &windows::Win32::Foundation::RECT) {
    use tauri::PhysicalPosition;
    let size = win
        .outer_size()
        .unwrap_or_else(|_| tauri::PhysicalSize::new(320u32, 88u32));
    let x = (work.left + work.right) / 2 - (size.width as i32) / 2;
    let y = work.bottom - BOTTOM_MARGIN_PX - size.height as i32;
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

#[cfg(not(windows))]
fn position_on_active_monitor(win: &tauri::WebviewWindow) {
    let _ = win.center();
}

/// Called once from setup: keep the transparent HUD from intercepting mouse
/// input anywhere it overlaps.
pub fn init_hud(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("hud") {
        let _ = win.set_ignore_cursor_events(true);
        make_topmost(&win);
    }
}

/// Environment-gated visual self-test: `POCKET_HUD_TEST=1 pocket.exe` shows a
/// "Captured" pill ~3s after launch on whichever monitor is active.
pub fn spawn_self_test_if_requested(app: AppHandle) {
    if std::env::var("POCKET_HUD_TEST").as_deref() != Ok("1") {
        return;
    }
    std::thread::Builder::new()
        .name("hud-self-test".into())
        .spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(3));
            crate::shortcuts::diag_log("hud self-test: showing Captured");
            show_hud(&app, "Captured", false);
        })
        .ok();
}
