use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// Flags shared with the double-shift keyboard hook. Capture gestures are
/// fixed (double-shift for text, double-shift-hold for voice), so the only
/// shared state is the gaming-mode suppression flag.
pub struct AppFlags {
    pub gaming: AtomicBool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureOpenPayload {
    pub mode: String,
    /// Text auto-grabbed from the foreground app's selection (if any).
    /// `None` means "open empty" — never stale clipboard content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
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
    show_capture_with_text(app, mode, None);
}

fn show_capture_with_text(app: &AppHandle, mode: &str, text: Option<String>) {
    let Some(win) = app.get_webview_window("quick-capture") else {
        eprintln!("[pocket] quick-capture window not found!");
        return;
    };
    let _ = win.center();
    let shown = win.show();
    let focused = win.set_focus();
    debug_log(&format!(
        "show_capture(mode={mode}) show={shown:?} focus={focused:?} prefill_len={}",
        text.as_ref().map(|t| t.len()).unwrap_or(0)
    ));
    let _ = app.emit_to(
        "quick-capture",
        "capture-open",
        CaptureOpenPayload { mode: mode.into(), text },
    );
}

/// Double-Shift path: like `toggle_quick_capture`, but first auto-grabs the
/// foreground app's selected text (if any) on a worker thread so neither the
/// hook callback nor the UI thread ever blocks.
pub fn show_text_capture_from_hotkey(app: &AppHandle) {
    let visible = app
        .get_webview_window("quick-capture")
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false);
    if visible {
        debug_log("capture window visible -> hiding");
        if let Some(win) = app.get_webview_window("quick-capture") {
            let _ = win.hide();
        }
        return;
    }
    let app_handle = app.clone();
    std::thread::Builder::new()
        .name("grab-selection".into())
        .spawn(move || {
            grab_log("grab: worker started (double-shift trigger)");
            let grabbed = grab_selected_text();
            let for_closure = app_handle.clone();
            let _ = app_handle.run_on_main_thread(move || {
                show_capture_with_text(&for_closure, "text", grabbed);
            });
        })
        .ok();
}

/// General diagnostics file log (same mechanism as the grab log): release GUI
/// builds drop stderr, so anything needed as evidence goes here.
/// Lives next to the executable as `pocket-diag.log`.
pub(crate) fn diag_log(message: &str) {
    use std::io::Write;
    let path = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(std::env::temp_dir)
        .join("pocket-diag.log");
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(f, "[{}] {message}", now_ms());
    }
    debug_log(message);
}

/// File log for the grab flow (release GUI builds drop stderr, so eprintln
/// alone is invisible there). Lives next to the executable as
/// `pocket-grab.log` — the data directory beside the exe is proven writable,
/// unlike %TEMP% which this process demonstrably cannot create files in.
fn grab_log_path() -> std::path::PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(std::env::temp_dir)
        .join("pocket-grab.log")
}

fn grab_log(message: &str) {
    use std::io::Write;
    let path = grab_log_path();
    match std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        Ok(mut f) => {
            let _ = writeln!(f, "[{}] {message}", now_ms());
        }
        Err(e) => {
            eprintln!("[pocket] grab_log failed ({}): {e}", path.display());
        }
    }
    debug_log(message);
}

/// Snapshot → synthetic Ctrl+C → compare. Returns the newly selected text, or
/// `None` when nothing was selected (clipboard unchanged/empty).
#[cfg(windows)]
fn grab_selected_text() -> Option<String> {
    // The user's fingers may still hold Shift: wait (bounded) for physical
    // release first, otherwise we'd send Ctrl+Shift+C instead of Ctrl+C.
    let mut waited_ms: u64 = 0;
    loop {
        let down = unsafe {
            use windows::Win32::UI::Input::KeyboardAndMouse::{
                GetAsyncKeyState, VK_LSHIFT, VK_RSHIFT,
            };
            let l = GetAsyncKeyState(VK_LSHIFT.0 as i32) as u16;
            let r = GetAsyncKeyState(VK_RSHIFT.0 as i32) as u16;
            (l & 0x8000) != 0 || (r & 0x8000) != 0
        };
        if !down || waited_ms >= 300 {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
        waited_ms += 10;
    }
    grab_log(&format!("grab: shift released after {waited_ms}ms"));

    // Wipe first: with the old content gone, anything we read afterwards
    // must be fresh output of THIS action — stale content can never leak
    // into the bar. (Overwriting the clipboard is accepted behavior.)
    clear_clipboard();
    grab_log("grab: clipboard cleared (sentinel)");

    if !send_ctrl_c() {
        grab_log("grab: SendInput(Ctrl+C) failed -> opening empty");
        return None;
    }
    grab_log("grab: synthetic Ctrl+C sent via SendInput");

    // The target app needs a moment to service the copy.
    std::thread::sleep(std::time::Duration::from_millis(150));

    let after = read_clipboard_text();
    match after {
        Some(t) if !t.trim().is_empty() => {
            let preview: String = t.chars().take(80).collect();
            let preview = preview.replace(['\r', '\n'], " ");
            grab_log(&format!(
                "grab: clipboard FRESH len={} preview='{preview}' -> pre-filling",
                t.len()
            ));
            Some(t)
        }
        _ => {
            grab_log("grab: clipboard still empty (nothing selected) -> opening empty");
            None
        }
    }
}

#[cfg(not(windows))]
fn grab_selected_text() -> Option<String> {
    None
}

/// Empties the clipboard (best effort). Called before the synthetic Ctrl+C so
/// a later read can only ever see fresh output of this action.
#[cfg(windows)]
fn clear_clipboard() {
    use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard};

    unsafe {
        for _ in 0..5 {
            if OpenClipboard(None).is_ok() {
                let _ = EmptyClipboard();
                let _ = CloseClipboard();
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }
}

/// Current clipboard Unicode text, if any. Retries briefly — the clipboard is
/// often momentarily locked by the app that owns it.
#[cfg(windows)]
fn read_clipboard_text() -> Option<String> {    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    };
    use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};

    /// CF_UNICODETEXT (13). The `windows` 0.61 metadata exposes
    /// `GetClipboardData` as taking a plain u32, so spell it out.
    const CF_UNICODETEXT: u32 = 13;

    let mut opened = false;
    for _ in 0..5 {
        if unsafe { OpenClipboard(None) }.is_ok() {
            opened = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    if !opened {
        return None;
    }

    let result = unsafe {
        if IsClipboardFormatAvailable(CF_UNICODETEXT).is_err() {
            None
        } else {
            match GetClipboardData(CF_UNICODETEXT) {
                Ok(h) if !h.0.is_null() => {
                    let ptr = GlobalLock(HGLOBAL(h.0)) as *const u16;
                    if ptr.is_null() {
                        None
                    } else {
                        let mut len = 0usize;
                        while len < 1_000_000 && *ptr.add(len) != 0 {
                            len += 1;
                        }
                        let slice = std::slice::from_raw_parts(ptr, len);
                        let s = String::from_utf16_lossy(slice);
                        let _ = GlobalUnlock(HGLOBAL(h.0));
                        Some(s)
                    }
                }
                _ => None,
            }
        }
    };
    let _ = unsafe { CloseClipboard() };
    result
}

/// Synthesizes a Ctrl+C keystroke into the foreground app.
#[cfg(windows)]
fn send_ctrl_c() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
        SendInput, VIRTUAL_KEY, VK_C, VK_CONTROL,
    };

    let key = |vk: VIRTUAL_KEY, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: if up {
                    KEYEVENTF_KEYUP
                } else {
                    KEYBD_EVENT_FLAGS(0)
                },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let inputs = [
        key(VK_CONTROL, false),
        key(VK_C, false),
        key(VK_C, true),
        key(VK_CONTROL, true),
    ];
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    sent == inputs.len() as u32
}

pub fn debug_log(message: &str) {
    if std::env::var("POCKET_DEBUG").as_deref() == Ok("1") {
        let t = now_ms() % 1_000_000;
        let tid = unsafe { windows::Win32::System::Threading::GetCurrentThreadId() };
        eprintln!("[pocket {:>6}.{:03} t{:x}] {message}", t / 1000, t % 1000, tid);
    }
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
        KBDLLHOOKSTRUCT, KBDLLHOOKSTRUCT_FLAGS, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP,
        WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    const LLKHF_INJECTED: KBDLLHOOKSTRUCT_FLAGS = KBDLLHOOKSTRUCT_FLAGS(0x10);
    const DOUBLE_SHIFT_WINDOW_MS: u64 = 450;
    const REPEAT_GUARD_MS: u64 = 60;
    /// Second Shift press held this long opens voice mode instead of text.
    /// The watcher polls the physical key state, so a quick tap-tap-release
    /// still resolves to text as soon as the release is seen (no added
    /// latency), while a tap-hold resolves to voice after this threshold.
    const HOLD_FOR_VOICE_MS: u64 = 400;
    const HOLD_POLL_MS: u64 = 15;

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
        /// True once Shift has been released since the previous Shift press.
        /// Starts true so the very first press can still begin a pair.
        /// Auto-repeat keydowns arrive with NO intervening key-up, so they
        /// can never look like a second press — this is what makes holding
        /// Shift safe regardless of repeat timing jitter.
        released_since_down: bool,
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
                released_since_down: true,
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
            // Keep this gap tiny: keystrokes landing inside it are invisible
            // to the double-shift detector (a 100ms blind window missed
            // roughly 1 in 250 double-shifts).
            std::thread::sleep(std::time::Duration::from_millis(20));
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
        let msg = wparam.0 as u32;
        let is_keydown = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
        let is_keyup = msg == WM_KEYUP || msg == WM_SYSKEYUP;
        if code as u32 == HC_ACTION && (is_keydown || is_keyup) {
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
                    "shift vk=0x{:02X} {} injected={}",
                    kb.vkCode,
                    if is_keydown { "down" } else { "up" },
                    injected
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
                        handle_key(state, is_shift, is_keydown);
                    }
                });
            }
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    /// Pure double-press decision, unit-tested below. A press only counts when
    /// a Shift *release* happened since the previous press — auto-repeat
    /// keydowns (held key, no releases) can never satisfy this.
    fn is_double_press(
        last_down_ms: u64,
        now_ms: u64,
        intervening: bool,
        released_since_down: bool,
    ) -> bool {
        released_since_down
            && last_down_ms > 0
            && !intervening
            && now_ms.saturating_sub(last_down_ms) >= REPEAT_GUARD_MS
            && now_ms.saturating_sub(last_down_ms) <= DOUBLE_SHIFT_WINDOW_MS
    }

    fn handle_key(state: &mut HookState, is_shift: bool, is_keydown: bool) {
        if !is_shift {
            if is_keydown {
                state.intervening_key = true;
            }
            return;
        }
        if !is_keydown {
            // Shift released: the next press is a genuinely new press.
            state.released_since_down = true;
            return;
        }
        if !state.released_since_down {
            // Shift is being held down (OS auto-repeat): not a new press.
            if HOOK_DEBUG.load(Ordering::Relaxed) {
                eprintln!("[pocket:hook] shift repeat ignored (held, no release yet)");
            }
            return;
        }
        let ms = now_ms();
        let elapsed = ms.saturating_sub(state.last_shift_down_ms);
        let double_shift = is_double_press(
            state.last_shift_down_ms,
            ms,
            state.intervening_key,
            state.released_since_down,
        );
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
        state.released_since_down = false;
    }

    /// True while either physical Shift key is held down. Polled from the
    /// hold-watcher thread (never from inside the hook callback).
    fn is_shift_physically_down() -> bool {
        unsafe {
            use windows::Win32::UI::Input::KeyboardAndMouse::{
                GetAsyncKeyState, VK_LSHIFT, VK_RSHIFT,
            };
            let l = GetAsyncKeyState(VK_LSHIFT.0 as i32) as u16;
            let r = GetAsyncKeyState(VK_RSHIFT.0 as i32) as u16;
            (l & 0x8000) != 0 || (r & 0x8000) != 0
        }
    }

    /// Pure hold decision, unit-tested below. `released_early` means the
    /// second press was released before the hold threshold elapsed.
    fn hold_decision(released_early: bool) -> &'static str {
        if released_early { "text" } else { "voice" }
    }

    fn try_trigger(app: &AppHandle) {
        let shared = app.state::<super::AppFlags>();
        if shared.gaming.load(Ordering::Relaxed) {
            debug_log("double-shift suppressed (gaming mode)");
            return;
        }
        debug_log("DOUBLE SHIFT detected -> watching for hold (voice) vs tap (text)");
        // Never touch window APIs from inside the hook callback: the hold
        // watcher runs on its own thread and dispatches the window work to
        // the main thread, so the callback returns instantly (a slow
        // callback gets the hook removed by the system).
        let app_handle = app.clone();
        std::thread::Builder::new()
            .name("double-shift-hold-watch".into())
            .spawn(move || {
                // Wait for either an early release (tap -> text mode) or the
                // hold threshold elapsing with Shift still down (hold ->
                // voice mode). Polling keeps tap-tap snappy: text opens as
                // soon as the release is seen instead of after a fixed delay.
                let mut elapsed_ms: u64 = 0;
                let mut released_early = false;
                while elapsed_ms < HOLD_FOR_VOICE_MS {
                    if !is_shift_physically_down() {
                        released_early = true;
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(HOLD_POLL_MS));
                    elapsed_ms += HOLD_POLL_MS;
                }
                let mode = hold_decision(released_early);
                // E2E-injected keys have no physical state, so they always
                // look "released": they correctly resolve to text mode.
                debug_log(&format!(
                    "double-shift hold watch: released_early={released_early} elapsed={elapsed_ms}ms -> {mode} mode"
                ));
                let for_main = app_handle.clone();
                let _ = app_handle.run_on_main_thread(move || {
                    // Re-check the gaming flag: it may have flipped during
                    // the short hold window.
                    let shared = for_main.state::<super::AppFlags>();
                    if shared.gaming.load(Ordering::Relaxed) {
                        debug_log("double-shift hold result suppressed (gaming mode)");
                        return;
                    }
                    if mode == "voice" {
                        super::show_voice_capture(&for_main);
                    } else {
                        super::show_text_capture_from_hotkey(&for_main);
                    }
                });
            })
            .ok();
    }

    #[cfg(test)]
    mod hook_tests {
        use super::{hold_decision, is_double_press, DOUBLE_SHIFT_WINDOW_MS, REPEAT_GUARD_MS};

        #[test]
        fn two_quick_distinct_presses_trigger() {
            // Second press 150ms after the first, with a release in between.
            assert!(is_double_press(1000, 1150, false, true));
        }

        #[test]
        fn held_shift_repeat_never_triggers() {
            // Same timing, but no release happened between presses.
            assert!(!is_double_press(1000, 1150, false, false));
            // Even far apart in time, without a release it must not fire.
            assert!(!is_double_press(1000, 1000 + DOUBLE_SHIFT_WINDOW_MS, false, false));
        }

        #[test]
        fn too_slow_or_first_press_does_not_trigger() {
            // Outside the double-tap window.
            assert!(!is_double_press(1000, 1000 + DOUBLE_SHIFT_WINDOW_MS + 1, false, true));
            // Faster than humanly possible (repeat guard).
            assert!(!is_double_press(1000, 1000 + REPEAT_GUARD_MS - 1, false, true));
            // First press ever.
            assert!(!is_double_press(0, 1150, false, true));
        }

        #[test]
        fn intervening_key_cancels_the_pair() {
            assert!(!is_double_press(1000, 1150, true, true));
        }

        #[test]
        fn hold_resolves_to_voice_and_tap_to_text() {
            // Second press released before the threshold -> text mode.
            assert_eq!(hold_decision(true), "text");
            // Still held when the threshold elapses -> voice mode.
            assert_eq!(hold_decision(false), "voice");
        }
    }
}

#[cfg(not(windows))]
pub mod double_shift {
    use tauri::AppHandle;
    pub fn spawn(_app: AppHandle) {}
}
