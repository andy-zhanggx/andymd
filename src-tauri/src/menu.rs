use tauri::{
    menu::{MenuBuilder, MenuEvent, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    AppHandle, Emitter, Runtime,
};

fn base_name(path: &str) -> String {
    path.rsplit(['/', '\\'])
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or(path)
        .to_string()
}

fn build_recent_submenu<R: Runtime>(
    app: &AppHandle<R>,
    recent_files: &[String],
    recent_workspaces: &[String],
) -> tauri::Result<tauri::menu::Submenu<R>> {
    let mut builder = SubmenuBuilder::new(app, "Open Recent");
    if recent_files.is_empty() && recent_workspaces.is_empty() {
        builder = builder.item(
            &MenuItemBuilder::with_id("recent-none", "No Recent Items")
                .enabled(false)
                .build(app)?,
        );
        return builder.build();
    }
    for path in recent_files {
        builder = builder.item(
            &MenuItemBuilder::with_id(format!("recent-file:{path}"), base_name(path)).build(app)?,
        );
    }
    if !recent_workspaces.is_empty() {
        builder = builder.separator();
        for path in recent_workspaces {
            builder = builder.item(
                &MenuItemBuilder::with_id(format!("recent-ws:{path}"), format!("📁 {}", base_name(path)))
                    .build(app)?,
            );
        }
    }
    builder = builder.separator().item(
        &MenuItemBuilder::with_id("clear-recent", "Clear Menu").build(app)?,
    );
    builder.build()
}

pub fn build_menu<R: Runtime>(
    app: &AppHandle<R>,
    recent_files: &[String],
    recent_workspaces: &[String],
) -> tauri::Result<tauri::menu::Menu<R>> {
    let app_menu = SubmenuBuilder::new(app, "AndyMD")
        .item(&PredefinedMenuItem::about(app, None, None)?)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(
            &MenuItemBuilder::with_id("new", "New")
                .accelerator("CmdOrCtrl+N")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("open", "Open File…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("open-workspace", "Open Workspace…")
                .accelerator("CmdOrCtrl+Shift+O")
                .build(app)?,
        )
        .item(&build_recent_submenu(app, recent_files, recent_workspaces)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("save", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("save-as", "Save As…")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("export-html", "Export to HTML…")
                .accelerator("CmdOrCtrl+Shift+E")
                .build(app)?,
        )
        .item(&SubmenuBuilder::new(app, "Export to")
            .item(&MenuItemBuilder::with_id("export-docx", "Word (.docx)…").build(app)?)
            .item(&MenuItemBuilder::with_id("export-epub", "ePub…").build(app)?)
            .item(&MenuItemBuilder::with_id("export-latex", "LaTeX (.tex)…").build(app)?)
            .item(&MenuItemBuilder::with_id("export-rtf", "Rich Text (.rtf)…").build(app)?)
            .build()?)
        .item(
            &MenuItemBuilder::with_id("print", "Print…")
                .accelerator("CmdOrCtrl+P")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("close", "Close")
                .accelerator("CmdOrCtrl+W")
                .build(app)?,
        )
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("find", "Find…")
                .accelerator("CmdOrCtrl+F")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("find-next", "Find Next")
                .accelerator("CmdOrCtrl+G")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("find-prev", "Find Previous")
                .accelerator("CmdOrCtrl+Shift+G")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("replace", "Replace…")
                .accelerator("CmdOrCtrl+Alt+F")
                .build(app)?,
        )
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(
            &MenuItemBuilder::with_id("toggle-sidebar", "Toggle Sidebar")
                .accelerator("CmdOrCtrl+B")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("toggle-outline", "Outline")
                .accelerator("CmdOrCtrl+Shift+1")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("toggle-source", "Source Code Mode")
                .accelerator("CmdOrCtrl+/")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("toggle-focus", "Focus Mode")
                .accelerator("F8")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("toggle-typewriter", "Typewriter Mode")
                .accelerator("F9")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("toggle-fullscreen", "Toggle Full Screen")
                .accelerator("F11")
                .build(app)?,
        )
        .build()?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &view_menu])
        .build()
}

pub fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let _ = app.emit("menu", event.id().as_ref());
}

/// Rebuild the application menu so the "Open Recent" submenu reflects the
/// latest recents. Called from the frontend whenever recents change.
#[tauri::command]
pub fn rebuild_recent_menu(
    app: AppHandle,
    recent_files: Vec<String>,
    recent_workspaces: Vec<String>,
) -> Result<(), String> {
    let menu = build_menu(&app, &recent_files, &recent_workspaces).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}
