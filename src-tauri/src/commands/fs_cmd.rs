use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

use crate::error::{CommandError, CommandResult};

/// The default, always-writable vault location for this app.
///
/// On iOS this is the app sandbox's Documents directory — it's writable with
/// plain `std::fs` (no security-scoped bookmark needed), is visible to the user
/// in the Files app, and syncs via iCloud when the app enables it. We seed it
/// with a welcome note on first launch so the editor never opens to an empty
/// void. On desktop it resolves to the user's Documents folder, but desktop
/// bootstraps from the last-opened workspace instead and never calls this.
#[tauri::command]
pub fn default_vault_dir(app: AppHandle) -> CommandResult<String> {
    let dir = app
        .path()
        .document_dir()
        .map_err(|e| CommandError::Other(format!("no documents dir: {e}")))?;
    fs::create_dir_all(&dir)?;

    let welcome = dir.join("Welcome.md");
    if fs::read_dir(&dir)?.next().is_none() {
        let _ = fs::write(&welcome, WELCOME_NOTE);
    }
    Ok(dir.to_string_lossy().into_owned())
}

const WELCOME_NOTE: &str = "# Welcome to AndyMD\n\nThis is your vault. Notes you create here live in the **Files** app under \
*On My iPhone → AndyMD* and sync via iCloud when enabled.\n\n- Tap **+** to create a note\n- Tap the folder icon to import an existing folder\n- Use `[[wikilinks]]` to connect notes\n";

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

/// Walk up from `from` looking for a directory containing `.obsidian`
/// (an Obsidian vault root). Falls back to the file's own directory.
#[tauri::command]
pub fn find_vault_root(from: String) -> CommandResult<String> {
    let mut dir = PathBuf::from(&from);
    if dir.is_file() {
        dir.pop();
    }
    let start = dir.clone();
    loop {
        if dir.join(".obsidian").is_dir() {
            return Ok(dir.to_string_lossy().into_owned());
        }
        if !dir.pop() {
            break;
        }
    }
    Ok(start.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn create_file(parent: String, name: String) -> CommandResult<FileNode> {
    let full = PathBuf::from(&parent).join(&name);
    if full.exists() {
        return Err(CommandError::Other(format!("{} already exists", name)));
    }
    fs::write(&full, "")?;
    Ok(FileNode {
        path: full.to_string_lossy().into(),
        name,
        kind: FileKind::File,
        children: None,
    })
}

#[tauri::command]
pub fn create_dir(parent: String, name: String) -> CommandResult<FileNode> {
    let full = PathBuf::from(&parent).join(&name);
    if full.exists() {
        return Err(CommandError::Other(format!("{} already exists", name)));
    }
    fs::create_dir(&full)?;
    Ok(FileNode {
        path: full.to_string_lossy().into(),
        name,
        kind: FileKind::Dir,
        children: Some(vec![]),
    })
}

#[tauri::command]
pub fn rename_path(from: String, to: String) -> CommandResult<()> {
    let from_p = PathBuf::from(&from);
    let to_p = PathBuf::from(&to);
    if to_p.exists() {
        return Err(CommandError::Other(format!("{} already exists", to)));
    }
    fs::rename(&from_p, &to_p)?;
    Ok(())
}

/// Delete a file or directory. Desktop sends it to the system Trash (recoverable);
/// iOS has no user-facing Trash, so we remove it directly from the sandbox.
#[tauri::command]
pub fn delete_to_trash(path: String) -> CommandResult<()> {
    #[cfg(desktop)]
    {
        trash::delete(&path).map_err(|e| CommandError::Trash(e.to_string()))?;
    }
    #[cfg(mobile)]
    {
        let p = PathBuf::from(&path);
        if p.is_dir() {
            fs::remove_dir_all(&p)?;
        } else {
            fs::remove_file(&p)?;
        }
    }
    Ok(())
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportImageResult {
    /// Path to insert into markdown, relative to the document's directory.
    pub rel_path: String,
    /// Absolute path of the copied asset.
    pub abs_path: String,
}

/// Pick a non-colliding destination inside `dir` for `file_name`,
/// appending `-1`, `-2`, … to the stem until the path is free.
fn unique_dest(dir: &Path, file_name: &str) -> PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| file_name.to_string());
    let ext = path.extension().map(|e| e.to_string_lossy().into_owned());
    for n in 1.. {
        let name = match &ext {
            Some(ext) => format!("{stem}-{n}.{ext}"),
            None => format!("{stem}-{n}"),
        };
        let candidate = dir.join(&name);
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

/// Resolve a collision-free destination inside `<doc-dir>/assets/` for an image
/// named `file_name`, creating the assets dir. Returns (absolute dest, result).
fn resolve_assets_dest(
    file_name: &str,
    doc_path: Option<String>,
) -> CommandResult<(PathBuf, ImportImageResult)> {
    let base_dir = doc_path
        .as_ref()
        .filter(|s| !s.is_empty())
        .and_then(|dp| PathBuf::from(dp).parent().map(|p| p.to_path_buf()))
        .ok_or_else(|| {
            CommandError::Other("save the document before importing images".into())
        })?;

    let clean = Path::new(file_name)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "image.png".to_string());

    let assets_dir = base_dir.join("assets");
    fs::create_dir_all(&assets_dir)?;
    let dest = unique_dest(&assets_dir, &clean);
    let dest_name = dest
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or(clean);

    Ok((
        dest.clone(),
        ImportImageResult {
            rel_path: format!("assets/{dest_name}"),
            abs_path: dest.to_string_lossy().into_owned(),
        },
    ))
}

/// Copy an existing image file into `<doc-dir>/assets/` and return the
/// document-relative path to embed.
#[tauri::command]
pub fn import_image(
    src_path: String,
    doc_path: Option<String>,
) -> CommandResult<ImportImageResult> {
    let src = PathBuf::from(&src_path);
    if !src.is_file() {
        return Err(CommandError::Other(format!("{src_path} is not a file")));
    }
    let file_name = src
        .file_name()
        .ok_or_else(|| CommandError::Other("source has no file name".into()))?
        .to_string_lossy()
        .to_string();
    let (dest, result) = resolve_assets_dest(&file_name, doc_path)?;
    fs::copy(&src, &dest)?;
    Ok(result)
}

/// Write dropped image bytes into `<doc-dir>/assets/` and return the
/// document-relative path. Used by the editor's drag-and-drop handler, which
/// receives file contents (not a filesystem path) from the webview.
#[tauri::command]
pub fn import_image_bytes(
    file_name: String,
    data: Vec<u8>,
    doc_path: Option<String>,
) -> CommandResult<ImportImageResult> {
    if data.is_empty() {
        return Err(CommandError::Other("dropped image is empty".into()));
    }
    let (dest, result) = resolve_assets_dest(&file_name, doc_path)?;
    fs::write(&dest, &data)?;
    Ok(result)
}

/// Reveal a path in the OS file manager (Finder). Desktop-only — iOS has no
/// "reveal in Finder", so the mobile build is a no-op (the UI hides the action).
#[tauri::command]
pub fn reveal_in_finder(path: String) -> CommandResult<()> {
    #[cfg(desktop)]
    {
        let p = PathBuf::from(&path);
        std::process::Command::new("open")
            .arg("-R")
            .arg(&p)
            .status()
            .map_err(|e| CommandError::Other(e.to_string()))?;
    }
    #[cfg(mobile)]
    {
        let _ = path;
    }
    Ok(())
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

    #[test]
    fn create_and_delete_file() {
        let dir = tempdir().unwrap();
        let node = create_file(dir.path().to_string_lossy().into(), "a.md".into()).unwrap();
        assert!(PathBuf::from(&node.path).exists());
        // Skip delete_to_trash — trash interacts with system Trash and may be blocked in sandboxed/CI runs.
        fs::remove_file(&node.path).unwrap();
    }

    #[test]
    fn create_file_rejects_existing() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "").unwrap();
        let err = create_file(dir.path().to_string_lossy().into(), "a.md".into());
        assert!(err.is_err());
    }

    #[test]
    fn import_image_copies_into_assets_and_returns_relative_path() {
        let dir = tempdir().unwrap();
        let doc = dir.path().join("note.md");
        fs::write(&doc, "# hi").unwrap();
        let img = dir.path().join("pic.png");
        fs::write(&img, b"\x89PNG fake").unwrap();

        let res = import_image(
            img.to_string_lossy().into(),
            Some(doc.to_string_lossy().into()),
        )
        .unwrap();

        assert_eq!(res.rel_path, "assets/pic.png");
        assert!(dir.path().join("assets/pic.png").exists());
        assert_eq!(fs::read(&res.abs_path).unwrap(), b"\x89PNG fake");
    }

    #[test]
    fn import_image_dedupes_name_on_collision() {
        let dir = tempdir().unwrap();
        let doc = dir.path().join("note.md");
        fs::write(&doc, "").unwrap();
        fs::create_dir(dir.path().join("assets")).unwrap();
        fs::write(dir.path().join("assets/pic.png"), "old").unwrap();
        let img = dir.path().join("pic.png");
        fs::write(&img, "new").unwrap();

        let res = import_image(
            img.to_string_lossy().into(),
            Some(doc.to_string_lossy().into()),
        )
        .unwrap();

        assert_eq!(res.rel_path, "assets/pic-1.png");
        assert!(dir.path().join("assets/pic-1.png").exists());
    }

    #[test]
    fn import_image_bytes_writes_into_assets() {
        let dir = tempdir().unwrap();
        let doc = dir.path().join("note.md");
        fs::write(&doc, "").unwrap();

        let res = import_image_bytes(
            "股指.jpg.png".into(),
            b"\x89PNG bytes".to_vec(),
            Some(doc.to_string_lossy().into()),
        )
        .unwrap();

        assert_eq!(res.rel_path, "assets/股指.jpg.png");
        assert_eq!(
            fs::read(dir.path().join("assets/股指.jpg.png")).unwrap(),
            b"\x89PNG bytes"
        );
    }

    #[test]
    fn import_image_bytes_dedupes_and_rejects_empty() {
        let dir = tempdir().unwrap();
        let doc = dir.path().join("note.md");
        fs::write(&doc, "").unwrap();
        fs::create_dir(dir.path().join("assets")).unwrap();
        fs::write(dir.path().join("assets/pic.png"), "old").unwrap();

        let res = import_image_bytes(
            "pic.png".into(),
            b"new".to_vec(),
            Some(doc.to_string_lossy().into()),
        )
        .unwrap();
        assert_eq!(res.rel_path, "assets/pic-1.png");

        let empty = import_image_bytes("x.png".into(), vec![], Some(doc.to_string_lossy().into()));
        assert!(empty.is_err());
    }

    #[test]
    fn import_image_bytes_strips_path_components_from_name() {
        let dir = tempdir().unwrap();
        let doc = dir.path().join("note.md");
        fs::write(&doc, "").unwrap();

        let res = import_image_bytes(
            "../../evil.png".into(),
            b"x".to_vec(),
            Some(doc.to_string_lossy().into()),
        )
        .unwrap();

        assert_eq!(res.rel_path, "assets/evil.png");
        assert!(dir.path().join("assets/evil.png").exists());
    }

    #[test]
    fn import_image_without_doc_path_errors() {
        let dir = tempdir().unwrap();
        let img = dir.path().join("pic.png");
        fs::write(&img, "x").unwrap();
        let err = import_image(img.to_string_lossy().into(), None);
        assert!(err.is_err());
    }

    #[test]
    fn rename_works() {
        let dir = tempdir().unwrap();
        let a = dir.path().join("a.md");
        let b = dir.path().join("b.md");
        fs::write(&a, "").unwrap();
        rename_path(a.to_string_lossy().into(), b.to_string_lossy().into()).unwrap();
        assert!(b.exists());
        assert!(!a.exists());
    }
}
