use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::error::CommandResult;
use crate::watcher::WatcherState;

#[tauri::command]
pub fn open_workspace(
    root: String,
    app: AppHandle,
    state: State<'_, WatcherState>,
) -> CommandResult<()> {
    state.start(app, PathBuf::from(root))?;
    Ok(())
}

#[tauri::command]
pub async fn pick_workspace_dir(app: AppHandle) -> CommandResult<Option<String>> {
    let picked = app
        .dialog()
        .file()
        .set_title("Select Workspace Folder")
        .blocking_pick_folder();
    Ok(picked.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn pick_markdown_file(app: AppHandle) -> CommandResult<Option<String>> {
    // macOS NSOpenPanel grays out .md when the extension isn't a registered UTI.
    // Provide an All Files escape hatch so users can always pick what they want.
    let picked = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "mdown", "mkd", "txt"])
        .add_filter("All Files", &["*"])
        .blocking_pick_file();
    Ok(picked.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn pick_image_file(app: AppHandle) -> CommandResult<Option<String>> {
    let picked = app
        .dialog()
        .file()
        .set_title("Insert Image")
        .add_filter(
            "Images",
            &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"],
        )
        .add_filter("All Files", &["*"])
        .blocking_pick_file();
    Ok(picked.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn save_markdown_dialog(
    app: AppHandle,
    default_name: String,
) -> CommandResult<Option<String>> {
    let picked = app
        .dialog()
        .file()
        .set_title("Save As")
        .add_filter("Markdown", &["md"])
        .set_file_name(&default_name)
        .blocking_save_file();
    Ok(picked.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn save_export_dialog(
    app: AppHandle,
    default_name: String,
    extension: String,
) -> CommandResult<Option<String>> {
    let ext = extension.clone();
    let picked = app
        .dialog()
        .file()
        .set_title("Export")
        .add_filter(extension.to_uppercase(), &[ext.as_str()])
        .set_file_name(&default_name)
        .blocking_save_file();
    Ok(picked.map(|p| p.to_string()))
}

/// Locate the pandoc binary. A Finder-launched .app has a minimal PATH that
/// usually excludes Homebrew / conda, so fall back to common install dirs.
#[cfg(desktop)]
fn resolve_pandoc() -> Option<String> {
    use std::process::{Command, Stdio};
    let on_path = Command::new("pandoc")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if on_path {
        return Some("pandoc".to_string());
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        "/opt/homebrew/bin/pandoc".to_string(),
        "/usr/local/bin/pandoc".to_string(),
        format!("{home}/miniconda3/bin/pandoc"),
        format!("{home}/.local/bin/pandoc"),
        format!("{home}/anaconda3/bin/pandoc"),
    ];
    candidates.into_iter().find(|p| std::path::Path::new(p).exists())
}

/// Export markdown to `to` (a pandoc writer name, e.g. docx/epub/latex/rtf/odt)
/// at `out_path`, piping the document through pandoc's stdin. Desktop-only: iOS
/// can't spawn subprocesses, so the mobile build returns an error and the UI
/// hides the export-via-pandoc actions.
#[cfg(mobile)]
#[tauri::command]
pub fn export_via_pandoc(_markdown: String, _to: String, _out_path: String) -> Result<(), String> {
    Err("Export via pandoc is not available on this platform.".to_string())
}

#[cfg(desktop)]
#[tauri::command]
pub fn export_via_pandoc(markdown: String, to: String, out_path: String) -> Result<(), String> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let pandoc = resolve_pandoc()
        .ok_or_else(|| "pandoc not found. Install it (e.g. `brew install pandoc`).".to_string())?;

    let mut child = Command::new(pandoc)
        .args([
            "-f",
            "markdown+tex_math_dollars+pipe_tables",
            "-t",
            &to,
            "--standalone",
            "-o",
            &out_path,
        ])
        .stdin(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to launch pandoc: {e}"))?;

    child
        .stdin
        .take()
        .ok_or("failed to open pandoc stdin")?
        .write_all(markdown.as_bytes())
        .map_err(|e| e.to_string())?;

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!(
            "pandoc failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

/// Toggle the window's fullscreen state. Desktop-only — iOS apps are always
/// "fullscreen", so the mobile build is a no-op.
#[tauri::command]
pub fn toggle_fullscreen(window: tauri::Window) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let fs = window.is_fullscreen().map_err(|e| e.to_string())?;
        window.set_fullscreen(!fs).map_err(|e| e.to_string())?;
    }
    #[cfg(mobile)]
    {
        let _ = window;
    }
    Ok(())
}

pub struct PendingOpensState(pub Mutex<Vec<String>>);

impl Default for PendingOpensState {
    fn default() -> Self {
        Self(Mutex::new(Vec::new()))
    }
}

#[tauri::command]
pub fn take_pending_opens(state: State<'_, PendingOpensState>) -> Vec<String> {
    let mut guard = state.0.lock().unwrap();
    std::mem::take(&mut *guard)
}
