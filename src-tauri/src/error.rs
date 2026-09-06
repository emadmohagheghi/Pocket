use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Workspace not found")]
    WorkspaceNotFound,
    #[error("Item not found")]
    ItemNotFound,
    #[error("Recording not found")]
    RecordingNotFound,
    #[error("Invalid data: {0}")]
    Invalid(String),
    #[error("Storage is unavailable: {0}")]
    Storage(String),
    #[error("Shortcut could not be registered — it may be owned by another application: {0}")]
    ShortcutUnavailable(String),
    #[error("Shortcut error: {0}")]
    #[allow(dead_code)]
    Shortcut(String),
    #[error("Recording error: {0}")]
    Recording(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
