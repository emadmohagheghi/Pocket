//! Minimal heads-up notification window: a dark pill ("Captured" /
//! "Recording…") shown at the bottom-center of the user's active monitor
//! when a capture is triggered by the global hotkeys. Never shown for
//! captures made inside the app itself.

use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{AppHandle, Emitter, Manager};

const HUD_LABEL: &str = "hud";
const AUTO_HIDE_MS: u64 = 1600;
/// Distance from the bottom of the monitor's work area.
const BOTTOM_MARGIN_PX: i32 = 48;

static HUD_SEQ: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HudMessage<'a> {
    text: &'a str,
    sticky: bool,
}

/// Show the HUD on the monitor that owns the foreground window (the monitor
/// the user is actually working on). `sticky` keeps it visible until the next
/// `show_hud` call — used for the "Recording…" state during a held capture.
pub fn show_hud(app: &AppHandle, text: &str, sticky: bool) {
    let Some(win) = app.get_webview_window(HUD_LABEL) else {
        return;
    };
    // Invalidate any pending auto-hide from a previous show.
    let seq = HUD_SEQ.fetch_add(1, Ordering::AcqRel) + 1;
    position_on_active_monitor(&win);
    let _ = win.show();
    let _ = app.emit_to(HUD_LABEL, "hud-message", HudMessage { text, sticky });

    if !sticky {
        let handle = app.clone();
        std::thread::Builder::new()
            .name("hud-auto-hide".into())
            .spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(AUTO_HIDE_MS));
                // A newer show (e.g. "Recording…" right after "Captured")
                // owns the HUD now; this hide must not fire.
                if HUD_SEQ.load(Ordering::Acquire) == seq {
                    let for_hide = handle.clone();
                    let _ = handle.run_on_main_thread(move || hide_hud(&for_hide));
                }
            })
            .ok();
    }
}

/// Explicitly hide the HUD (used when a sticky "Recording…" ends without a
/// save, e.g. the panel was dismissed).
pub fn hide_hud(app: &AppHandle) {
    let _ = app.emit_to(HUD_LABEL, "hud-message", HudMessage { text: "", sticky: false });
    if let Some(win) = app.get_webview_window(HUD_LABEL) {
        let _ = win.hide();
    }
}

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
        .unwrap_or_else(|_| tauri::PhysicalSize::new(220u32, 72u32));
    let x = (work.left + work.right) / 2 - (size.width as i32) / 2;
    let y = work.bottom - BOTTOM_MARGIN_PX - size.height as i32;
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

#[cfg(not(windows))]
fn position_on_active_monitor(win: &tauri::WebviewWindow) {
    let _ = win.center();
}
