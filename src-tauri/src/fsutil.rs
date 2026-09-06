use std::fs;
use std::io::Write;
use std::path::Path;

use serde::de::DeserializeOwned;

/// Writes a JSON document atomically: serialize to a temp file in the same
/// directory, flush to disk, then rename over the target. A crash mid-write
/// can never corrupt the previous version of the file.
pub fn write_json_atomic<T: serde::Serialize>(path: &Path, value: &T) -> std::io::Result<()> {
    let dir = path.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "path has no parent directory",
        )
    })?;
    fs::create_dir_all(dir)?;
    let tmp = dir.join(format!(
        ".{}.tmp",
        path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".into())
    ));
    {
        let mut f = fs::File::create(&tmp)?;
        let body = serde_json::to_vec_pretty(value)?;
        f.write_all(&body)?;
        f.sync_all()?;
    }
    // rename() replaces existing files on Windows (std maps to MoveFileEx with
    // REPLACE_EXISTING), so this is a safe atomic swap.
    fs::rename(&tmp, path)?;
    Ok(())
}

pub fn read_json<T: DeserializeOwned>(path: &Path) -> std::io::Result<T> {
    let body = fs::read(path)?;
    serde_json::from_slice(&body)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string()))
}

/// Recursively compute the total size in bytes of a directory tree.
pub fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            total += dir_size(&entry.path());
        } else {
            total += meta.len();
        }
    }
    total
}

/// Removes a directory tree, ignoring "not found" so double-deletes are safe.
pub fn remove_tree(path: &Path) -> std::io::Result<()> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

/// True when we are allowed to create files in `dir` (probe with a temp file).
pub fn is_writable(dir: &Path) -> bool {
    if dir.exists() && !dir.is_dir() {
        return false;
    }
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".pocket-write-probe");
    match fs::File::create(&probe) {
        Ok(_) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// Normalized workspace id guard: only allows ids we generated ourselves.
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Safe display-name/extension guard for recording files written to disk.
pub fn valid_file_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && Path::new(name)
            .file_name()
            .map(|n| n == name)
            .unwrap_or(false)
        && !name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])
        && name != "."
        && name != ".."
}
