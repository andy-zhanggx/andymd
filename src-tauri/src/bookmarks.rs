//! Security-scoped bookmarks.
//!
//! Under the macOS App Sandbox (mandatory for Mac App Store builds) the powerbox
//! grants access to a folder only for the lifetime of the process that the user
//! picked it in. A bare path stored in `config.json` is therefore worthless on
//! the next launch — `lastWorkspace` would reopen to a wall of permission
//! errors.
//!
//! The fix Apple intends is a *security-scoped bookmark*: at pick time we ask
//! `NSURL` for an opaque blob that re-grants access later. We persist one blob
//! per picked folder/file and resolve them all during `setup()`, before the
//! frontend asks to reopen anything.
//!
//! Outside the sandbox these calls still succeed and are simply redundant, so
//! the same code path runs in the DMG build — no flavor-specific branching, and
//! the bookmark logic gets exercised during ordinary development.

use std::path::{Path, PathBuf};

/// Where the bookmark blobs live. Sibling of `config.json` so that clearing
/// app data drops stale grants too.
fn bookmarks_dir() -> Option<PathBuf> {
    let dir = dirs::data_dir()?.join("com.andyz.andymd").join("bookmarks");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

/// Deterministic per-path filename, so re-picking the same folder overwrites
/// its blob instead of piling up duplicates.
fn blob_path(dir: &Path, path: &Path) -> PathBuf {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hasher);
    dir.join(format!("{:016x}.bookmark", hasher.finish()))
}

#[cfg(target_os = "macos")]
mod imp {
    use super::*;
    use objc2::rc::Retained;
    use objc2::runtime::Bool;
    use objc2_foundation::{
        NSData, NSString, NSURL, NSURLBookmarkCreationOptions, NSURLBookmarkResolutionOptions,
    };

    fn file_url(path: &Path) -> Retained<NSURL> {
        NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()))
    }

    /// Create and persist a bookmark for a path the user just picked.
    ///
    /// Best-effort: a failure here costs the user a re-pick after relaunch, not
    /// the current session, so callers ignore the result.
    pub fn store(path: &Path) -> Result<(), String> {
        let dir = bookmarks_dir().ok_or("no Application Support dir")?;
        let url = file_url(path);
        let data = url
            .bookmarkDataWithOptions_includingResourceValuesForKeys_relativeToURL_error(
                NSURLBookmarkCreationOptions::WithSecurityScope,
                None,
                None,
            )
            .map_err(|e| format!("bookmarkDataWithOptions failed: {e:?}"))?;
        std::fs::write(blob_path(&dir, path), data.to_vec()).map_err(|e| e.to_string())
    }

    /// Resolve one blob and open its security scope.
    ///
    /// The resolved `NSURL` is deliberately leaked: access ends when the URL is
    /// released, and we want it to last for the whole process. There is one
    /// leak per previously-picked folder, bounded by the recents list.
    fn start_access(blob: &[u8]) -> Option<PathBuf> {
        let data = NSData::with_bytes(blob);
        let mut stale = Bool::NO;
        // SAFETY: `stale` is a valid pointer to a live local.
        let url = unsafe {
            NSURL::URLByResolvingBookmarkData_options_relativeToURL_bookmarkDataIsStale_error(
                &data,
                NSURLBookmarkResolutionOptions::WithSecurityScope,
                None,
                &mut stale,
            )
        }
        .ok()?;
        // SAFETY: `url` came from a security-scoped bookmark.
        if !unsafe { url.startAccessingSecurityScopedResource() } {
            return None;
        }
        let path = url.path().map(|p| PathBuf::from(p.to_string()));
        std::mem::forget(url);
        path
    }

    /// Re-authorize every folder the user has previously picked. Called once
    /// during `setup()`, before the frontend restores `lastWorkspace`.
    pub fn restore_all() -> Vec<PathBuf> {
        let Some(dir) = bookmarks_dir() else {
            return Vec::new();
        };
        let Ok(entries) = std::fs::read_dir(&dir) else {
            return Vec::new();
        };
        let mut restored = Vec::new();
        for entry in entries.flatten() {
            let blob_file = entry.path();
            if blob_file.extension().and_then(|e| e.to_str()) != Some("bookmark") {
                continue;
            }
            match std::fs::read(&blob_file) {
                Ok(blob) => match start_access(&blob) {
                    Some(path) => restored.push(path),
                    // A blob that no longer resolves (folder deleted, or the
                    // user revoked access) is dead weight — drop it.
                    None => {
                        let _ = std::fs::remove_file(&blob_file);
                    }
                },
                Err(_) => continue,
            }
        }
        restored
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        /// Exercises the real NSURL round-trip: bookmark a directory, read the
        /// blob back off disk, resolve it, and confirm we land on the same path
        /// with its security scope open. This is the one piece of the App Store
        /// build that cannot be verified by inspection.
        #[test]
        fn bookmark_round_trips_to_the_same_path() {
            let dir = tempfile::tempdir().expect("tempdir");
            // macOS hands out /var -> /private/var symlinks; compare canonical.
            let original = dir.path().canonicalize().expect("canonicalize");

            store(&original).expect("store bookmark");

            let blob_file = blob_path(&bookmarks_dir().expect("bookmarks dir"), &original);
            let blob = std::fs::read(&blob_file).expect("blob written");
            assert!(!blob.is_empty(), "bookmark blob should not be empty");

            let resolved = start_access(&blob).expect("resolve + start access");
            assert_eq!(resolved.canonicalize().expect("canonicalize"), original);

            let _ = std::fs::remove_file(&blob_file);
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use super::*;

    pub fn store(_path: &Path) -> Result<(), String> {
        Ok(())
    }

    pub fn restore_all() -> Vec<PathBuf> {
        Vec::new()
    }
}

/// Persist a security-scoped bookmark for a freshly picked path.
pub fn store(path: &Path) {
    if let Err(e) = imp::store(path) {
        eprintln!("[bookmarks] could not bookmark {}: {e}", path.display());
    }
}

/// Re-open the security scope of every previously picked path.
pub fn restore_all() -> Vec<PathBuf> {
    imp::restore_all()
}
