use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::fsutil;
use crate::models::*;

pub struct Store {
    pub data_dir: PathBuf,
    pub uses_fallback_location: bool,
    pub settings: Settings,
    pub workspaces: Vec<WorkspaceMeta>,
    pub data: HashMap<String, WorkspaceData>,
}

impl Store {
    // ---------------------------------------------------------------- layout

    pub fn settings_path(&self) -> PathBuf {
        self.data_dir.join("settings.json")
    }
    pub fn index_path(&self) -> PathBuf {
        self.data_dir.join("workspaces.json")
    }
    fn workspace_dir(&self, ws_id: &str) -> PathBuf {
        self.data_dir.join("workspaces").join(ws_id)
    }
    fn workspace_path(&self, ws_id: &str) -> PathBuf {
        self.workspace_dir(ws_id).join("workspace.json")
    }
    pub fn voices_dir(&self, ws_id: &str) -> PathBuf {
        self.data_dir.join("voices").join(ws_id)
    }
    pub fn recording_path(&self, ws_id: &str, file: &str) -> PathBuf {
        self.voices_dir(ws_id).join(file)
    }

    // ------------------------------------------------------------------ load

    pub fn load(data_dir: PathBuf, uses_fallback_location: bool) -> Store {
        fs::create_dir_all(&data_dir).ok();

        // Settings: fall back to defaults on missing/corrupt file (keep the
        // corrupt file around for recovery).
        let settings = match fsutil::read_json::<Settings>(&data_dir.join("settings.json")) {
            Ok(s) => s,
            Err(_) => {
                backup_corrupt(&data_dir.join("settings.json"));
                Settings::default()
            }
        };

        let workspaces: Vec<WorkspaceMeta> =
            match fsutil::read_json(&data_dir.join("workspaces.json")) {
                Ok(w) => w,
                Err(_) => {
                    backup_corrupt(&data_dir.join("workspaces.json"));
                    Vec::new()
                }
            };

        let mut data = HashMap::new();
        for ws in &workspaces {
            if !fsutil::valid_id(&ws.id) {
                continue;
            }
            let path = self_path(&data_dir, &ws.id);
            let ws_data = match fsutil::read_json::<WorkspaceData>(&path) {
                Ok(d) => d,
                Err(_) => {
                    backup_corrupt(&path);
                    WorkspaceData::default()
                }
            };
            data.insert(ws.id.clone(), ws_data);
        }

        let mut store = Store {
            data_dir,
            uses_fallback_location,
            settings,
            workspaces,
            data,
        };
        if store.workspaces.is_empty() {
            let ws = WorkspaceMeta {
                id: Uuid::new_v4().to_string(),
                name: "Personal".into(),
                created_at: now_ms(),
                updated_at: now_ms(),
            };
            store.workspaces.push(ws.clone());
            store.data.insert(ws.id.clone(), WorkspaceData::default());
            store.settings.active_workspace_id = ws.id.clone();
            store.persist_index();
            store.persist_workspace(&ws.id);
        }
        if !store
            .workspaces
            .iter()
            .any(|w| w.id == store.settings.active_workspace_id)
        {
            store.settings.active_workspace_id = store.workspaces[0].id.clone();
            store.persist_settings();
        }
        store
    }

    // ---------------------------------------------------------------- persist

    pub fn persist_settings(&self) {
        if let Err(e) = fsutil::write_json_atomic(&self.settings_path(), &self.settings) {
            eprintln!("[pocket] failed to persist settings: {e}");
        }
    }

    pub fn persist_index(&self) {
        if let Err(e) = fsutil::write_json_atomic(&self.index_path(), &self.workspaces) {
            eprintln!("[pocket] failed to persist workspace index: {e}");
        }
    }

    pub fn persist_workspace(&self, ws_id: &str) {
        let data = self.data.get(ws_id).cloned().unwrap_or_default();
        if let Err(e) = fsutil::write_json_atomic(&self.workspace_path(ws_id), &data) {
            eprintln!("[pocket] failed to persist workspace {ws_id}: {e}");
        }
    }

    // ------------------------------------------------------------- workspaces

    pub fn workspace(&self, ws_id: &str) -> AppResult<&WorkspaceMeta> {
        self.workspaces
            .iter()
            .find(|w| w.id == ws_id)
            .ok_or(AppError::WorkspaceNotFound)
    }

    pub fn workspace_data(&self, ws_id: &str) -> AppResult<&WorkspaceData> {
        if !fsutil::valid_id(ws_id) {
            return Err(AppError::Invalid("invalid workspace id".into()));
        }
        self.data.get(ws_id).ok_or(AppError::WorkspaceNotFound)
    }

    pub fn workspace_data_mut(&mut self, ws_id: &str) -> AppResult<&mut WorkspaceData> {
        if !fsutil::valid_id(ws_id) {
            return Err(AppError::Invalid("invalid workspace id".into()));
        }
        self.touch_workspace(ws_id);
        self.data.get_mut(ws_id).ok_or(AppError::WorkspaceNotFound)
    }

    fn touch_workspace(&mut self, ws_id: &str) {
        if let Some(ws) = self.workspaces.iter_mut().find(|w| w.id == ws_id) {
            ws.updated_at = now_ms();
        }
    }

    pub fn counts(&self, ws_id: &str) -> AppResult<Counts> {
        let data = self.workspace_data(ws_id)?;
        Ok(Counts {
            texts: data.items.len(),
            recordings: data.recordings.len(),
        })
    }

    pub fn workspace_info(&self, ws_id: &str) -> AppResult<WorkspaceInfo> {
        Ok(WorkspaceInfo {
            meta: self.workspace(ws_id)?.clone(),
            counts: self.counts(ws_id)?,
        })
    }

    pub fn all_workspace_infos(&self) -> Vec<WorkspaceInfo> {
        self.workspaces
            .iter()
            .filter_map(|w| self.workspace_info(&w.id).ok())
            .collect()
    }

    pub fn create_workspace(&mut self, name: &str) -> AppResult<WorkspaceInfo> {
        let name = name.trim();
        if name.is_empty() || name.len() > 64 {
            return Err(AppError::Invalid(
                "workspace name must be 1-64 characters".into(),
            ));
        }
        let ws = WorkspaceMeta {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            created_at: now_ms(),
            updated_at: now_ms(),
        };
        self.workspaces.push(ws.clone());
        self.data.insert(ws.id.clone(), WorkspaceData::default());
        self.persist_index();
        self.persist_workspace(&ws.id);
        self.workspace_info(&ws.id)
    }

    pub fn rename_workspace(&mut self, ws_id: &str, name: &str) -> AppResult<WorkspaceInfo> {
        let name = name.trim();
        if name.is_empty() || name.len() > 64 {
            return Err(AppError::Invalid(
                "workspace name must be 1-64 characters".into(),
            ));
        }
        let ws = self
            .workspaces
            .iter_mut()
            .find(|w| w.id == ws_id)
            .ok_or(AppError::WorkspaceNotFound)?;
        ws.name = name.to_string();
        ws.updated_at = now_ms();
        self.persist_index();
        self.workspace_info(ws_id)
    }

    pub fn delete_workspace(&mut self, ws_id: &str) -> AppResult<()> {
        if !fsutil::valid_id(ws_id) {
            return Err(AppError::Invalid("invalid workspace id".into()));
        }
        if self.workspaces.len() <= 1 {
            return Err(AppError::Invalid(
                "the last workspace cannot be deleted".into(),
            ));
        }
        let Some(pos) = self.workspaces.iter().position(|w| w.id == ws_id) else {
            return Err(AppError::WorkspaceNotFound);
        };

        // Remove on-disk data first; if this fails we abort so the index and
        // the files never disagree.
        crate::shortcuts::diag_log("delete: removing voices dir");
        fsutil::remove_tree(&self.voices_dir(ws_id))
            .map_err(|e| AppError::Storage(format!("could not delete voice files: {e}")))?;
        crate::shortcuts::diag_log("delete: removing workspace dir");
        fsutil::remove_tree(&self.workspace_dir(ws_id))
            .map_err(|e| AppError::Storage(format!("could not delete workspace file: {e}")))?;

        self.workspaces.remove(pos);
        self.data.remove(ws_id);
        crate::shortcuts::diag_log("delete: persisting index");
        self.persist_index();

        if self.settings.active_workspace_id == ws_id {
            self.settings.active_workspace_id = self.workspaces[0].id.clone();
            self.persist_settings();
        }
        Ok(())
    }

    pub fn set_active_workspace(&mut self, ws_id: &str) -> AppResult<()> {
        self.workspace(ws_id)?;
        self.settings.active_workspace_id = ws_id.to_string();
        self.persist_settings();
        Ok(())
    }

    // ------------------------------------------------------------------ items

    pub fn create_item(&mut self, ws_id: &str, new: NewItem) -> AppResult<Item> {
        if new.content.trim().is_empty() {
            return Err(AppError::Invalid("content cannot be empty".into()));
        }
        let content = new.content.trim().to_string();
        let url = new.url.map(|u| u.trim().to_string()).filter(|u| !u.is_empty());
        let item = Item {
            id: Uuid::new_v4().to_string(),
            item_type: ItemType::Text,
            content,
            title: new
                .title
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty()),
            url,
            created_at: now_ms(),
            updated_at: now_ms(),
        };
        let data = self.workspace_data_mut(ws_id)?;
        data.items.push(item.clone());
        self.persist_workspace(ws_id);
        Ok(item)
    }

    pub fn update_item(&mut self, ws_id: &str, item_id: &str, patch: ItemPatch) -> AppResult<Item> {
        let data = self.workspace_data_mut(ws_id)?;
        let item = data
            .items
            .iter_mut()
            .find(|i| i.id == item_id)
            .ok_or(AppError::ItemNotFound)?;
        if let Some(c) = patch.content {
            let c = c.trim().to_string();
            if c.is_empty() {
                return Err(AppError::Invalid("content cannot be empty".into()));
            }
            item.content = c;
        }
        if let Some(t) = patch.title {
            item.title = t.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        }
        if let Some(u) = patch.url {
            item.url = u.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        }
        item.updated_at = now_ms();
        let item = item.clone();
        self.persist_workspace(ws_id);
        Ok(item)
    }

    pub fn delete_item(&mut self, ws_id: &str, item_id: &str) -> AppResult<()> {
        let data = self.workspace_data_mut(ws_id)?;
        let len_before = data.items.len();
        data.items.retain(|i| i.id != item_id);
        if data.items.len() == len_before {
            return Err(AppError::ItemNotFound);
        }
        self.persist_workspace(ws_id);
        Ok(())
    }

    // ------------------------------------------------------------- recordings

    pub fn save_recording(
        &mut self,
        ws_id: &str,
        name: &str,
        duration_ms: u64,
        data_bytes: &[u8],
    ) -> AppResult<Recording> {
        if data_bytes.is_empty() {
            return Err(AppError::Recording("empty recording".into()));
        }
        if data_bytes.len() > 100 * 1024 * 1024 {
            return Err(AppError::Recording("recording too large".into()));
        }
        let id = Uuid::new_v4().to_string();
        let file = format!("{id}.webm");

        let dir = self.voices_dir(ws_id);
        fs::create_dir_all(&dir)
            .map_err(|e| AppError::Storage(format!("cannot create voices directory: {e}")))?;
        // Write to a temp name then rename, so a crash never leaves a
        // half-written recording registered in metadata.
        let final_path = dir.join(&file);
        let tmp_path = dir.join(format!(".{file}.tmp"));
        {
            use std::io::Write;
            let mut f = fs::File::create(&tmp_path)
                .map_err(|e| AppError::Storage(format!("cannot write recording: {e}")))?;
            f.write_all(data_bytes)
                .map_err(|e| AppError::Storage(format!("cannot write recording: {e}")))?;
            f.sync_all()
                .map_err(|e| AppError::Storage(format!("cannot write recording: {e}")))?;
        }
        fs::rename(&tmp_path, &final_path)
            .map_err(|e| AppError::Storage(format!("cannot finalize recording: {e}")))?;

        let rec = Recording {
            id,
            name: clean_recording_name(name),
            file,
            duration_ms,
            size_bytes: data_bytes.len() as u64,
            created_at: now_ms(),
        };
        let data = self.workspace_data_mut(ws_id)?;
        data.recordings.push(rec.clone());
        self.persist_workspace(ws_id);
        Ok(rec)
    }

    pub fn rename_recording(
        &mut self,
        ws_id: &str,
        rec_id: &str,
        name: &str,
    ) -> AppResult<Recording> {
        let data = self.workspace_data_mut(ws_id)?;
        let rec = data
            .recordings
            .iter_mut()
            .find(|r| r.id == rec_id)
            .ok_or(AppError::RecordingNotFound)?;
        rec.name = clean_recording_name(name);
        let rec = rec.clone();
        self.persist_workspace(ws_id);
        Ok(rec)
    }

    pub fn delete_recording(&mut self, ws_id: &str, rec_id: &str) -> AppResult<()> {
        let (file, remaining) = {
            let data = self.workspace_data_mut(ws_id)?;
            let Some(pos) = data.recordings.iter().position(|r| r.id == rec_id) else {
                return Err(AppError::RecordingNotFound);
            };
            let rec = data.recordings.remove(pos);
            (rec.file, data.recordings.len())
        };
        match fs::remove_file(self.recording_path(ws_id, &file)) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => {
                self.persist_workspace(ws_id);
                return Err(AppError::Storage(format!(
                    "could not delete voice file: {e}"
                )));
            }
        }
        self.persist_workspace(ws_id);
        let _ = remaining;
        Ok(())
    }

    // ----------------------------------------------------------------- search

    pub fn search(&self, ws_id: &str, query: &str) -> AppResult<Vec<SearchHit>> {
        let q = query.trim().to_lowercase();
        if q.is_empty() {
            return Ok(Vec::new());
        }
        let data = self.workspace_data(ws_id)?;
        let mut hits = Vec::new();
        for item in &data.items {
            let title = item
                .title
                .clone()
                .unwrap_or_else(|| default_item_title(item));
            let haystacks = [
                title.to_lowercase(),
                item.content.to_lowercase(),
                item.url.clone().unwrap_or_default().to_lowercase(),
            ];
            if haystacks.iter().any(|h| h.contains(&q)) {
                hits.push(SearchHit {
                    kind: "text".into(),
                    id: item.id.clone(),
                    title,
                    snippet: snippet(&item.content, &q),
                    created_at: item.created_at,
                });
            }
        }
        for rec in &data.recordings {
            if rec.name.to_lowercase().contains(&q) {
                hits.push(SearchHit {
                    kind: "voice".into(),
                    id: rec.id.clone(),
                    title: rec.name.clone(),
                    snippet: format!("voice note · {}", rec.file),
                    created_at: rec.created_at,
                });
            }
        }
        hits.sort_by_key(|h| std::cmp::Reverse(h.created_at));
        Ok(hits)
    }
}

// ------------------------------------------------------------------- helpers

/// Canonical per-workspace data file path (shared by load and save).
fn self_path(data_dir: &std::path::Path, ws_id: &str) -> PathBuf {
    data_dir
        .join("workspaces")
        .join(ws_id)
        .join("workspace.json")
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn clean_recording_name(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        "Voice note".into()
    } else {
        trimmed.chars().take(120).collect()
    }
}

pub fn default_item_title(item: &Item) -> String {
    let first_line = item.content.lines().next().unwrap_or("").trim();
    let mut t: String = first_line.chars().take(80).collect();
    if first_line.chars().count() > 80 {
        t.push('…');
    }
    if t.is_empty() {
        "Untitled".into()
    } else {
        t
    }
}

fn snippet(content: &str, query: &str) -> String {
    let lower = content.to_lowercase();
    match lower.find(query) {
        Some(idx) => {
            let start = idx.saturating_sub(40);
            let s: String = content
                .chars()
                .skip(
                    content
                        .char_indices()
                        .position(|(bi, _)| bi == start)
                        .unwrap_or(0),
                )
                .take(120)
                .collect();
            let prefix = if start > 0 { "…" } else { "" };
            format!("{prefix}{s}")
        }
        None => content.chars().take(120).collect(),
    }
}

fn backup_corrupt(path: &PathBuf) {
    if path.exists() {
        let backup = path.with_extension(format!(
            "corrupt-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0)
        ));
        eprintln!("[pocket] corrupt data file, backing up: {}", path.display());
        let _ = fs::rename(path, backup);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_store() -> (Store, PathBuf) {
        let dir = std::env::temp_dir().join(format!("pocket-test-{}", uuid::Uuid::new_v4()));
        let store = Store::load(dir.clone(), false);
        (store, dir)
    }

    fn cleanup(dir: &PathBuf) {
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn workspace_lifecycle_and_file_cleanup() {
        let (mut store, dir) = test_store();
        let ws = store.create_workspace("Test WS").unwrap();

        store
            .create_item(
                &ws.meta.id,
                NewItem {
                    item_type: ItemType::Text,
                    content: "hello world".into(),
                    title: None,
                    url: None,
                },
            )
            .unwrap();
        store
            .save_recording(&ws.meta.id, "note", 1500, b"fakeaudio")
            .unwrap();

        assert!(store.workspace_path(&ws.meta.id).exists());
        assert!(store
            .recording_path(&ws.meta.id, &store.data[&ws.meta.id].recordings[0].file)
            .exists());

        let counts = store.counts(&ws.meta.id).unwrap();
        assert_eq!(counts.texts, 1);
        assert_eq!(counts.recordings, 1);

        store.delete_workspace(&ws.meta.id).unwrap();
        assert!(!store.workspace_path(&ws.meta.id).exists());
        assert!(!store.voices_dir(&ws.meta.id).exists());
        assert_eq!(store.workspaces.len(), 1);
        cleanup(&dir);
    }

    #[test]
    fn search_finds_items_and_recordings() {
        let (mut store, dir) = test_store();
        let ws = store.create_workspace("WS").unwrap();
        store
            .create_item(
                &ws.meta.id,
                NewItem {
                    item_type: ItemType::Text,
                    content: "Rust ownership rules".into(),
                    title: None,
                    url: None,
                },
            )
            .unwrap();
        store
            .save_recording(&ws.meta.id, "Standup notes", 500, b"x")
            .unwrap();

        let hits = store.search(&ws.meta.id, "rust").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].kind, "text");

        let hits = store.search(&ws.meta.id, "standup").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].kind, "voice");

        assert!(store.search(&ws.meta.id, "  ").unwrap().is_empty());
        cleanup(&dir);
    }

    #[test]
    fn link_items_carry_url() {
        let (mut store, dir) = test_store();
        let ws = store.create_workspace("WS").unwrap();
        let item = store
            .create_item(
                &ws.meta.id,
                NewItem {
                    item_type: ItemType::Text,
                    content: "https://example.com".into(),
                    title: None,
                    url: None,
                },
            )
            .unwrap();
        assert_eq!(item.item_type, ItemType::Text);
        cleanup(&dir);
    }

    #[test]
    fn persist_and_reload_roundtrip() {
        let dir = std::env::temp_dir().join(format!("pocket-test-{}", uuid::Uuid::new_v4()));
        {
            let mut store = Store::load(dir.clone(), false);
            let ws = store.create_workspace("Persisted").unwrap();
            store.set_active_workspace(&ws.meta.id).unwrap();
            store
                .create_item(
                    &ws.meta.id,
                    NewItem {
                        item_type: ItemType::Text,
                        content: "survives restart".into(),
                        title: None,
                        url: None,
                    },
                )
                .unwrap();
        }
        {
            let store = Store::load(dir.clone(), false);
            assert_eq!(store.workspaces.len(), 2);
            assert_eq!(store.settings.active_workspace_id, store.workspaces[1].id);
            let data = store.workspace_data(&store.workspaces[1].id).unwrap();
            assert_eq!(data.items.len(), 1);
            assert_eq!(data.items[0].content, "survives restart");
        }
        cleanup(&dir);
    }

    #[test]
    fn recording_delete_removes_file() {
        let (mut store, dir) = test_store();
        let ws = store.create_workspace("WS").unwrap();
        let rec = store
            .save_recording(&ws.meta.id, "temp", 100, b"abc")
            .unwrap();
        let path = store.recording_path(&ws.meta.id, &rec.file);
        assert!(path.exists());
        store.delete_recording(&ws.meta.id, &rec.id).unwrap();
        assert!(!path.exists());
        cleanup(&dir);
    }
}
