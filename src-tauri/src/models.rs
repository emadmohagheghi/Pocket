use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemType {
    Note,
    Prompt,
    Task,
    Link,
    Text,
}

impl ItemType {
    #[allow(dead_code)]
    pub fn all() -> [ItemType; 5] {
        [
            ItemType::Text,
            ItemType::Note,
            ItemType::Prompt,
            ItemType::Task,
            ItemType::Link,
        ]
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub item_type: ItemType,
    pub content: String,
    pub title: Option<String>,
    pub url: Option<String>,
    pub completed: bool,
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
    pub notes: usize,
    pub prompts: usize,
    pub tasks: usize,
    pub links: usize,
    pub recordings: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub launch_on_startup: bool,
    pub start_minimized: bool,
    pub close_to_tray: bool,
    /// "DoubleShift" or an accelerator string like "Ctrl+Shift+Space".
    pub quick_capture_shortcut: String,
    /// Accelerator string, or None when unassigned.
    pub voice_shortcut: Option<String>,
    pub active_workspace_id: String,
    pub gaming_detection_enabled: bool,
    pub theme: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            launch_on_startup: false,
            start_minimized: false,
            close_to_tray: true,
            quick_capture_shortcut: "DoubleShift".into(),
            voice_shortcut: None,
            active_workspace_id: String::new(),
            gaming_detection_enabled: true,
            theme: "system".into(),
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SettingsPatch {
    pub launch_on_startup: Option<bool>,
    pub start_minimized: Option<bool>,
    pub close_to_tray: Option<bool>,
    pub gaming_detection_enabled: Option<bool>,
    pub theme: Option<String>,
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
    pub item_type: Option<ItemType>,
    pub content: Option<String>,
    pub title: Option<Option<String>>,
    pub url: Option<Option<String>>,
    pub completed: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub completed: bool,
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
pub struct InitialState {
    pub settings: Settings,
    pub workspaces: Vec<WorkspaceInfo>,
    pub storage: StorageInfo,
}
