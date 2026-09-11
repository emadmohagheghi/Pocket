//! Fullscreen / game detection (Windows).
//!
//! Polls the foreground window a few times per second and decides whether the
//! user is likely in a fullscreen or borderless-fullscreen game. When the
//! state flips, the shared gaming flag is updated. The double-shift keyboard
//! hook consults the same flag, so while this reports "gaming" no capture
//! gesture can fire.

use std::sync::atomic::Ordering;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::shortcuts::AppFlags;

/// Temporary feature gate. The implementation remains compiled and ready to
/// re-enable after the detector issues have been resolved.
pub const ENABLED: bool = false;

#[derive(Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GamingState {
    pub gaming: bool,
}

pub fn spawn(app: AppHandle) {
    std::thread::Builder::new()
        .name("gaming-detection".into())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_millis(1500));
            tick(&app);
        })
        .expect("failed to spawn gaming detection thread");
}

fn tick(app: &AppHandle) {
    use std::sync::Mutex;
    // Keep the lock scope tiny — this loop runs forever.
    let enabled = {
        let store = app.state::<Mutex<crate::storage::Store>>();
        let store = store.lock().unwrap();
        store.settings.gaming_detection_enabled
    };

    let active = enabled && detect();

    let shared = app.state::<AppFlags>();
    let prev = shared.gaming.load(Ordering::Relaxed);
    if prev == active {
        return;
    }
    shared.gaming.store(active, Ordering::Relaxed);
    let _ = app.emit("gaming-mode-changed", GamingState { gaming: active });
    if active {
        // Never leave the capture window floating over a game.
        if let Some(win) = app.get_webview_window("quick-capture") {
            let _ = win.hide();
        }
    }
}

#[cfg(windows)]
fn detect() -> bool {
    unsafe { imp::detect_windows() }
}

#[cfg(not(windows))]
fn detect() -> bool {
    false
}

#[cfg(windows)]
mod imp {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, RECT};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId,
        IsWindowVisible, GWL_STYLE, WS_CAPTION, WS_THICKFRAME,
    };

    /// Fullscreen browsers with F11 would otherwise trip the detector.
    const NON_GAME_PROCESSES: &[&str] = &[
        "chrome.exe",
        "msedge.exe",
        "firefox.exe",
        "opera.exe",
        "opera_gx.exe",
        "brave.exe",
        "vivaldi.exe",
        "arc.exe",
        "explorer.exe",
        "applicationframehost.exe",
        "searchhost.exe",
        "shellexperiencehost.exe",
        "systemsettings.exe",
    ];

    pub unsafe fn detect_windows() -> bool {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() || !IsWindowVisible(hwnd).as_bool() {
            return false;
        }

        // Ignore our own windows.
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 || pid == std::process::id() {
            return false;
        }

        // Regular windows have a caption / sizing frame — games in borderless
        // or exclusive fullscreen do not.
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
        if style & WS_CAPTION.0 != 0 || style & WS_THICKFRAME.0 != 0 {
            return false;
        }

        // The window must cover its entire monitor.
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return false;
        }
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return false;
        }
        let m = info.rcMonitor;
        let covers_monitor = rect.left <= m.left
            && rect.top <= m.top
            && rect.right >= m.right
            && rect.bottom >= m.bottom;
        if !covers_monitor {
            return false;
        }

        // Screen "desktop" surfaces and browsers are not games.
        if let Some(exe) = process_image_name(pid) {
            let lower = exe.to_lowercase();
            if NON_GAME_PROCESSES.iter().any(|p| lower.ends_with(p)) {
                return false;
            }
        }
        true
    }

    unsafe fn process_image_name(pid: u32) -> Option<String> {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
        .is_ok();
        CloseHandle(handle).ok();
        if ok {
            Some(String::from_utf16_lossy(&buf[..len as usize]))
        } else {
            None
        }
    }
}
