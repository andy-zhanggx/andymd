use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::error::{CommandError, CommandResult};

#[derive(Serialize)]
pub struct ReadFileResult {
    pub content: String,
    pub mtime: u64,
}

#[derive(Serialize)]
pub struct WriteFileResult {
    pub mtime: u64,
}

fn file_mtime_millis(path: &Path) -> CommandResult<u64> {
    let meta = fs::metadata(path)?;
    let modified = meta.modified()?;
    let dur = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|e| CommandError::Other(e.to_string()))?;
    Ok(dur.as_millis() as u64)
}

#[tauri::command]
pub fn read_file(path: String) -> CommandResult<ReadFileResult> {
    let p = PathBuf::from(&path);
    let content = fs::read_to_string(&p)?;
    let mtime = file_mtime_millis(&p)?;
    Ok(ReadFileResult { content, mtime })
}

/// Atomic write: tmp file in the same dir, fsync, rename.
#[tauri::command]
pub fn write_file(path: String, content: String) -> CommandResult<WriteFileResult> {
    let dest = PathBuf::from(&path);
    let parent = dest
        .parent()
        .ok_or_else(|| CommandError::Other("path has no parent".into()))?;
    fs::create_dir_all(parent)?;

    let file_name = dest
        .file_name()
        .ok_or_else(|| CommandError::Other("path has no file name".into()))?
        .to_string_lossy()
        .to_string();
    let tmp_name = format!(".{}.{}.tmp", file_name, uuid::Uuid::new_v4());
    let tmp = parent.join(tmp_name);

    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(content.as_bytes())?;
        f.sync_all()?;
    }
    fs::rename(&tmp, &dest)?;

    let mtime = file_mtime_millis(&dest)?;
    Ok(WriteFileResult { mtime })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn read_write_roundtrip() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("a.md");
        let path_str = p.to_string_lossy().into_owned();

        let res = write_file(path_str.clone(), "# hello".into()).unwrap();
        assert!(res.mtime > 0);

        let read = read_file(path_str).unwrap();
        assert_eq!(read.content, "# hello");
        assert!(read.mtime > 0);
    }

    #[test]
    fn atomic_write_leaves_no_tmp_on_success() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("a.md");
        write_file(p.to_string_lossy().into(), "x".into()).unwrap();

        let entries: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(entries, vec!["a.md"]);
    }

    #[test]
    fn write_creates_missing_dirs() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("deep/nested/a.md");
        write_file(p.to_string_lossy().into(), "x".into()).unwrap();
        assert!(p.exists());
    }
}
