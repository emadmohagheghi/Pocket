use serde::{Deserialize, Serialize};

/// The only persisted item kind: plain text. Voice notes are separate
/// `Recording` entities, not items. Kept as an enum (with a single variant)
/// so the wire format stays stable if kinds are ever added back.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemType {
    Text,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub item_type: ItemType,
    pub content: String,
    pub title: Option<String>,
    pub url: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recording {
    pub id: String,
    pub name: String,
    /// File name inside the workspace voices directory (e.g. `abc.webm`).
    pub file: String,
    pub duration_ms: u64,
    pub size_bytes: u64,
    #[serde(default)]
    pub pinned: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkspaceData {
    pub items: Vec<Item>,
    pub recordings: Vec<Recording>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMeta {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    #[serde(flatten)]
    pub meta: WorkspaceMeta,
    pub counts: Counts,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub texts: usize,
    pub recordings: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub launch_on_startup: bool,
    pub start_minimized: bool,
    pub active_workspace_id: String,
    pub gaming_detection_enabled: bool,
    pub theme: String,
    pub note_preview_lines: u8,
    pub pin_control_style: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            launch_on_startup: false,
            start_minimized: false,
            active_workspace_id: String::new(),
            gaming_detection_enabled: false,
            theme: "system".into(),
            note_preview_lines: 5,
            pin_control_style: "hover-toolbar".into(),
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SettingsPatch {
    pub launch_on_startup: Option<bool>,
    pub start_minimized: Option<bool>,
    pub gaming_detection_enabled: Option<bool>,
    pub theme: Option<String>,
    pub note_preview_lines: Option<u8>,
    pub pin_control_style: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewItem {
    pub item_type: ItemType,
    pub content: String,
    pub title: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ItemPatch {
    pub content: Option<String>,
    pub title: Option<Option<String>>,
    pub url: Option<Option<String>>,
    pub pinned: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub data_dir: String,
    pub size_bytes: u64,
    pub uses_fallback_location: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSummary {
    pub path: String,
    pub workspaces: usize,
    pub items: usize,
    pub recordings: usize,
    pub audio_files: usize,
    pub missing_audio: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub workspaces_created: usize,
    pub workspaces_merged: usize,
    pub items_imported: usize,
    pub items_skipped: usize,
    pub recordings_imported: usize,
    pub recordings_skipped: usize,
    pub audio_files_restored: usize,
    pub missing_audio: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitialState {
    pub settings: Settings,
    pub workspaces: Vec<WorkspaceInfo>,
    pub storage: StorageInfo,
}

#[cfg(test)]
mod tests {
    use super::{Item, Recording, Settings};

    #[test]
    fn fresh_install_starts_with_the_main_window_visible() {
        assert!(!Settings::default().start_minimized);
    }

    #[test]
    fn note_preview_defaults_to_five_lines() {
        assert_eq!(Settings::default().note_preview_lines, 5);
    }

    #[test]
    fn old_settings_files_gain_the_note_preview_default() {
        let settings: Settings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(settings.note_preview_lines, 5);
        assert_eq!(settings.pin_control_style, "hover-toolbar");
    }

    #[test]
    fn old_entries_are_unpinned_by_default() {
        let item: Item = serde_json::from_str(
            r#"{"id":"i","itemType":"text","content":"note","title":null,"url":null,"createdAt":1,"updatedAt":1}"#,
        )
        .unwrap();
        let recording: Recording = serde_json::from_str(
            r#"{"id":"r","name":"voice","file":"r.webm","durationMs":1,"sizeBytes":1,"createdAt":1}"#,
        )
        .unwrap();

        assert!(!item.pinned);
        assert!(!recording.pinned);
    }
}
