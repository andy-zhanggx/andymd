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

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub enum FileKind {
    File,
    Dir,
}

#[derive(Serialize, Debug, Clone)]
pub struct FileNode {
    pub path: String,
    pub name: String,
    pub kind: FileKind,
    pub children: Option<Vec<FileNode>>,
}

fn build_tree(root: &Path, show_hidden: bool) -> CommandResult<Option<FileNode>> {
    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.to_string_lossy().into_owned());
    let path = root.to_string_lossy().into_owned();

    if root.is_file() {
        let is_md = root
            .extension()
            .map(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
            .unwrap_or(false);
        if !is_md && !show_hidden {
            return Ok(None);
        }
        return Ok(Some(FileNode {
            path,
            name,
            kind: FileKind::File,
            children: None,
        }));
    }

    if !root.is_dir() {
        return Ok(None);
    }

    if !show_hidden && name.starts_with('.') && root.parent().is_some() {
        return Ok(None);
    }

    let mut children = Vec::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let child_path = entry.path();
        if let Some(child) = build_tree(&child_path, show_hidden)? {
            children.push(child);
        }
    }
    children.sort_by(|a, b| match (&a.kind, &b.kind) {
        (FileKind::Dir, FileKind::File) => std::cmp::Ordering::Less,
        (FileKind::File, FileKind::Dir) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    if children.is_empty() && !show_hidden && root.parent().is_some() {
        return Ok(None);
    }

    Ok(Some(FileNode {
        path,
        name,
        kind: FileKind::Dir,
        children: Some(children),
    }))
}

#[tauri::command]
pub fn list_workspace(root: String, show_hidden: bool) -> CommandResult<FileNode> {
    let p = PathBuf::from(&root);
    if !p.is_dir() {
        return Err(CommandError::Other(format!("{} is not a directory", root)));
    }
    build_tree(&p, show_hidden)?
        .ok_or_else(|| CommandError::Other("empty workspace".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::{Builder, TempDir};

    fn tempdir() -> std::io::Result<TempDir> {
        Builder::new().prefix("tmp").tempdir()
    }

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

    #[test]
    fn list_workspace_filters_non_md() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "").unwrap();
        fs::write(dir.path().join("b.txt"), "").unwrap();

        let tree = list_workspace(dir.path().to_string_lossy().into(), false).unwrap();
        let children = tree.children.as_ref().unwrap();
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].name, "a.md");
    }

    #[test]
    fn list_workspace_recurses() {
        let dir = tempdir().unwrap();
        let sub = dir.path().join("sub");
        fs::create_dir(&sub).unwrap();
        fs::write(sub.join("c.md"), "").unwrap();

        let tree = list_workspace(dir.path().to_string_lossy().into(), false).unwrap();
        let dirs: Vec<_> = tree.children.as_ref().unwrap().iter().collect();
        assert_eq!(dirs.len(), 1);
        assert_eq!(dirs[0].name, "sub");
        let sub_children = dirs[0].children.as_ref().unwrap();
        assert_eq!(sub_children.len(), 1);
        assert_eq!(sub_children[0].name, "c.md");
    }

    #[test]
    fn list_workspace_prunes_empty_dirs() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("empty")).unwrap();
        fs::write(dir.path().join("a.md"), "").unwrap();

        let tree = list_workspace(dir.path().to_string_lossy().into(), false).unwrap();
        let children = tree.children.as_ref().unwrap();
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].name, "a.md");
    }
}
