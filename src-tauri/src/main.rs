#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Keep release builds in sync when frontend-only interaction changes are bundled.
fn main() {
    pocket_lib::run()
}
