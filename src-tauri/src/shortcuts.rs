use std::str::FromStr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::error::{AppError, AppResult};

/// Shortcut configuration shared between the registration engine and the
/// double-shift keyboard hook.
pub struct ShortcutShared {
    pub config: Mutex<ShortcutConfig>,
    pub gaming: AtomicBool,
}

#[derive(Debug, Clone)]
pub struct ShortcutConfig {
    /// "DoubleShift" or an accelerator string.
    pub quick_capture: String,
    pub voice: Option<String>,
}

impl ShortcutConfig {
    pub fn from_settings(settings: &crate::models::Settings) -> Self {
        ShortcutConfig {
            quick_capture: settings.quick_capture_shortcut.clone(),
            voice: settings.voice_shortcut.clone(),
        }
    }
}

pub const DOUBLE_SHIFT: &str = "DoubleShift";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureOpenPayload {
    pub mode: String,
}

/// Show the quick-capture window (or hide it if it is already visible).
pub fn toggle_quick_capture(app: &AppHandle) {
    let Some(win) = app.get_webview_window("quick-capture") else {
        eprintln!("[pocket] quick-capture window not found!");
        return;
    };
    match win.is_visible() {
        Ok(true) => {
            debug_log("capture window visible -> hiding");
            let _ = win.hide();
        }
        res => {
            debug_log(&format!(
                "capture window is_visible={res:?} -> showing (text mode)"
            ));
            show_capture(app, "text");
        }
    }
}

/// Show the quick-capture window in voice mode.
pub fn show_voice_capture(app: &AppHandle) {
    debug_log("voice capture requested");
    show_capture(app, "voice");
}

fn show_capture(app: &AppHandle, mode: &str) {
    let Some(win) = app.get_webview_window("quick-capture") else {
        eprintln!("[pocket] quick-capture window not found!");
        return;
    };
    let _ = win.center();
    let shown = win.show();
    let focused = win.set_focus();
    debug_log(&format!(
        "show_capture(mode={mode}) show={shown:?} focus={focused:?}"
    ));
    let _ = app.emit_to(
        "quick-capture",
        "capture-open",
        CaptureOpenPayload { mode: mode.into() },
    );
}

pub fn debug_log(message: &str) {
    if std::env::var("POCKET_DEBUG").as_deref() == Ok("1") {
        let t = now_ms() % 1_000_000;
        let tid = unsafe { windows::Win32::System::Threading::GetCurrentThreadId() };
        eprintln!("[pocket {:>6}.{:03} t{:x}] {message}", t / 1000, t % 1000, tid);
    }
}

/// True when the given string is a valid accelerator for the global shortcut
/// plugin (or the special "DoubleShift" value).
pub fn validate_shortcut_string(value: &str) -> AppResult<()> {
    if value == DOUBLE_SHIFT {
        return Ok(());
    }
    Shortcut::from_str(value)
        .map(|_| ())
        .map_err(|e| AppError::Invalid(format!("invalid shortcut '{value}': {e}")))
}

/// (Re)register all accelerator-based global shortcuts. Called at startup,
/// after settings changes and on gaming-mode transitions. DoubleShift is not
/// registered here — it runs on the low-level keyboard hook which checks the
/// gaming flag itself.
pub fn apply_registrations(app: &AppHandle) {
    let shared = app.state::<ShortcutShared>();
    let gaming = shared.gaming.load(Ordering::Relaxed);
    let config = shared
        .config
        .lock()
        .map(|c| c.clone())
        .unwrap_or(ShortcutConfig { quick_capture: DOUBLE_SHIFT.into(), voice: None });

    debug_log(&format!(
        "apply_registrations: gaming={gaming} quick='{}' voice={:?}",
        config.quick_capture, config.voice
    ));

    let gs = app.global_shortcut();
    // Always start from a clean slate — avoids stale/duplicate registrations.
    let _ = gs.unregister_all();
    if gaming {
        // While gaming, no accelerator is registered at all. The double-shift
        // hook consults the gaming flag and refuses to trigger.
        return;
    }

    if config.quick_capture != DOUBLE_SHIFT {
        match register_accelerator(app, &config.quick_capture, "text".to_string()) {
            Ok(()) => debug_log(&format!("registered accelerator '{}'", config.quick_capture)),
            Err(e) => eprintln!(
                "[pocket] failed to register quick-capture shortcut '{}': {e}",
                config.quick_capture
            ),
        }
    }
    if let Some(voice) = &config.voice {
        match register_accelerator(app, voice, "voice".to_string()) {
            Ok(()) => debug_log(&format!("registered accelerator '{voice}'")),
            Err(e) => eprintln!("[pocket] failed to register voice shortcut '{voice}': {e}"),
        }
    }
}

fn register_accelerator(app: &AppHandle, accel: &str, mode: String) -> AppResult<()> {
    let shortcut = Shortcut::from_str(accel)
        .map_err(|e| AppError::Invalid(format!("invalid shortcut '{accel}': {e}")))?;
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let shared = app.state::<ShortcutShared>();
                if shared.gaming.load(Ordering::Relaxed) {
                    return; // refuse to react while gaming
                }
                match mode.as_str() {
                    "voice" => show_voice_capture(app),
                    _ => toggle_quick_capture(app),
                }
            }
        })
        .map_err(|e| AppError::ShortcutUnavailable(e.to_string()))?;
    Ok(())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Double-shift global hotkey (low-level keyboard hook, Windows)
// ---------------------------------------------------------------------------

#[cfg(windows)]
pub mod double_shift {
    use super::*;
    use std::cell::RefCell;

    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::Input::KeyboardAndMouse::{VK_LSHIFT, VK_RSHIFT, VK_SHIFT};
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, PostThreadMessageW, SetWindowsHookExW, HC_ACTION, HHOOK,
        KBDLLHOOKSTRUCT, KBDLLHOOKSTRUCT_FLAGS, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_QUIT,
        WM_SYSKEYDOWN,
    };

    const LLKHF_INJECTED: KBDLLHOOKSTRUCT_FLAGS = KBDLLHOOKSTRUCT_FLAGS(0x10);
    const DOUBLE_SHIFT_WINDOW_MS: u64 = 450;
    const REPEAT_GUARD_MS: u64 = 60;

    /// Windows silently drops low-level hooks whose callback misses the
    /// system timeout (e.g. while the process is saturated during startup).
    /// As a safety net the hook is re-registered on this interval; the cost
    /// is a few unprotected keystrokes once every 30 seconds.
    const REHOOK_INTERVAL_SECS: u64 = 30;

    /// Set once when the hook thread starts; per-event diagnostics stay off
    /// unless requested, because any I/O in the callback risks the timeout.
    static HOOK_DEBUG: AtomicBool = AtomicBool::new(false);
    static LAST_EVENT_MS: AtomicU64 = AtomicU64::new(0);

    fn debug_enabled() -> bool {
        std::env::var("POCKET_DEBUG").as_deref() == Ok("1")
    }

    /// When set, injected key events are allowed to trigger the double-shift
    /// detection. Used only for automated end-to-end tests — real keyboards
    /// never need this, and it must stay off in normal runs so that games and
    /// macros cannot open the capture window.
    fn e2e_keys_enabled() -> bool {
        std::env::var("POCKET_E2E_KEYS").as_deref() == Ok("1")
    }

    struct HookState {
        app: AppHandle,
        last_shift_down_ms: u64,
        intervening_key: bool,
    }

    thread_local! {
        static STATE: RefCell<Option<HookState>> = const { RefCell::new(None) };
    }

    pub fn spawn(app: AppHandle) {
        // Install the hook only after the app has settled: during webview
        // initialization the process is saturated and the first slow callback
        // can get the low-level hook silently dropped.
        let delay_ms: u64 = std::env::var("POCKET_HOOK_DELAY_MS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(1500);
        std::thread::Builder::new()
            .name("double-shift-hook".into())
            .spawn(move || {
                start_rehook_watchdog();
                std::thread::sleep(std::time::Duration::from_millis(delay_ms));
                unsafe { run_hook(app) }
            })
            .expect("failed to spawn keyboard hook thread");
    }

    unsafe fn install_hook() -> HHOOK {
        SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), None, 0).unwrap_or_default()
    }

    unsafe fn run_hook(app: AppHandle) {
        STATE.with(|s| {
            *s.borrow_mut() = Some(HookState {
                app,
                last_shift_down_ms: 0,
                intervening_key: false,
            });
        });
        HOOK_DEBUG.store(debug_enabled(), Ordering::Relaxed);
        LAST_EVENT_MS.store(now_ms(), Ordering::Relaxed);
        HOOK_THREAD_ID.store(GetCurrentThreadId(), Ordering::Relaxed);

        // Supervisor loop: run the blocking message pump; a watchdog posts
        // WM_QUIT periodically, and we then re-register the hook — this heals
        // the "system silently dropped the low-level hook" failure mode.
        loop {
            let hhook = install_hook();
            if hhook.is_invalid() {
                eprintln!(
                    "[pocket] failed to install keyboard hook (getlasterror={:?}); retrying in 2s",
                    std::io::Error::last_os_error()
                );
                std::thread::sleep(std::time::Duration::from_secs(2));
                continue;
            }
            debug_log("low-level keyboard hook installed");

            let mut msg = MSG::default();
            // GetMessageW returns 0 on WM_QUIT / -1 on error; either way the
            // supervisor re-installs.
            loop {
                let ret = GetMessageW(&mut msg, None, 0, 0);
                if ret.0 <= 0 {
                    debug_log(&format!(
                        "GetMessageW returned {:?} (lasterr={:?})",
                        ret.0,
                        std::io::Error::last_os_error()
                    ));
                    break;
                }
            }
            let _ = windows::Win32::UI::WindowsAndMessaging::UnhookWindowsHookEx(hhook);
            debug_log("keyboard hook cycle ended; reinstalling");
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    }

    static HOOK_THREAD_ID: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

    fn hook_file_log(msg: &str) {
        use std::io::Write;
        let path = std::env::temp_dir().join("pocket-hook-debug.log");
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(f, "{msg}");
        }
    }

    /// Posts WM_QUIT to the hook thread so the supervisor re-registers the
    /// hook — heals cases where Windows silently dropped it under load.
    fn start_rehook_watchdog() {
        std::thread::Builder::new()
            .name("hook-watchdog".into())
            .spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(REHOOK_INTERVAL_SECS));
                let tid = HOOK_THREAD_ID.load(Ordering::Relaxed);
                debug_log(&format!("watchdog tick -> posting WM_QUIT to t{tid:x}"));
                if tid != 0 {
                    unsafe {
                        let _ = PostThreadMessageW(tid, WM_QUIT, Default::default(), Default::default());
                    }
                }
            })
            .expect("failed to spawn hook watchdog");
    }

    unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code as u32 == HC_ACTION
            && (wparam.0 as u32 == WM_KEYDOWN || wparam.0 as u32 == WM_SYSKEYDOWN)
        {
            let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
            LAST_EVENT_MS.store(now_ms(), Ordering::Relaxed);
            // Ignore injected input (games / automation) unless E2E testing.
            let injected = (kb.flags & LLKHF_INJECTED).0 != 0;
            // NOTE: the LL hook reports VK_LSHIFT / VK_RSHIFT for real
            // keyboards — VK_SHIFT alone never matches.
            let is_shift = kb.vkCode == VK_LSHIFT.0 as u32
                || kb.vkCode == VK_RSHIFT.0 as u32
                || kb.vkCode == VK_SHIFT.0 as u32;
            if is_shift {
                // Rare enough to be safe for diagnostics; proves whether the
                // callback sees shift events at all.
                hook_file_log(&format!(
                    "shift vk=0x{:02X} injected={}",
                    kb.vkCode, injected
                ));
            }
            if !injected || e2e_keys_enabled() {
                if HOOK_DEBUG.load(Ordering::Relaxed) {
                    eprintln!(
                        "[pocket:hook] keydown vk=0x{:02X} injected={} shift={}",
                        kb.vkCode, injected, is_shift
                    );
                }
                STATE.with(|s| {
                    if let Some(state) = s.borrow_mut().as_mut() {
                        handle_key(state, is_shift);
                    }
                });
            }
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    fn handle_key(state: &mut HookState, is_shift: bool) {
        if !is_shift {
            state.intervening_key = true;
            return;
        }
        let ms = now_ms();
        let elapsed = ms.saturating_sub(state.last_shift_down_ms);
        // Auto-repeat guard: real repeats come in much faster than a human
        // double-tap and must not count as a second press.
        if elapsed >= REPEAT_GUARD_MS {
            let double_shift = elapsed <= DOUBLE_SHIFT_WINDOW_MS
                && !state.intervening_key
                && state.last_shift_down_ms > 0;
            if HOOK_DEBUG.load(Ordering::Relaxed) {
                eprintln!(
                    "[pocket:hook] shift down elapsed={elapsed}ms window_open={} intervening={}",
                    elapsed <= DOUBLE_SHIFT_WINDOW_MS, state.intervening_key
                );
            }
            if double_shift {
                try_trigger(&state.app);
            }
            state.last_shift_down_ms = ms;
            state.intervening_key = false;
        }
    }

    fn try_trigger(app: &AppHandle) {
        let shared = app.state::<ShortcutShared>();
        if shared.gaming.load(Ordering::Relaxed) {
            debug_log("double-shift suppressed (gaming mode)");
            return;
        }
        let wants_double_shift = shared
            .config
            .lock()
            .map(|c| c.quick_capture == DOUBLE_SHIFT)
            .unwrap_or(false);
        if !wants_double_shift {
            debug_log("double-shift ignored (shortcut reassigned)");
            return;
        }
        debug_log("DOUBLE SHIFT detected -> toggling quick capture");
        // Never touch window APIs from inside the hook callback: dispatch the
        // window work to the main thread so the callback returns instantly
        // (a slow callback gets the hook removed by the system).
        let app_handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            toggle_quick_capture(&app_handle);
        });
    }
}

#[cfg(not(windows))]
pub mod double_shift {
    use tauri::AppHandle;
    pub fn spawn(_app: AppHandle) {}
}
