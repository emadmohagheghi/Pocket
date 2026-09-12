#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Keep release builds in sync when frontend-only interaction changes are bundled
// (this also forces Cargo to relink the embedded frontend assets).
fn main() {
    pocket_lib::run()
}
