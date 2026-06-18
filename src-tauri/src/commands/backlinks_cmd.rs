//! Vault-wide backlink counting.
//!
//! Counts how many link references across a vault resolve to a given target
//! note — both Obsidian `[[wikilinks]]` (including `![[embeds]]`) and Markdown
//! `[text](relative/path.md)` links. Resolution mirrors the frontend
//! `resolveWikilinkInTree` (see `src/lib/wikilink.ts`): wikilinks resolve by
//! basename anywhere in the vault, by vault-root-relative path when they
//! contain `/`, or relative to the linking file for `./`–`../` targets;
//! Markdown links always resolve relative to the linking file's directory.
//!
//! The scan reads every Markdown file on demand. It runs on Tauri's command
//! thread pool, so a large vault never blocks the webview; the frontend simply
//! awaits the count and re-runs it when the document or workspace changes.

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::CommandResult;

/// A link extracted from a note's text, tagged with how it should resolve.
struct Link {
    /// True for `[[wikilink]]`/`![[embed]]` targets, false for `](md-link)`.
    wiki: bool,
    /// The raw target string (alias/heading/query already stripped).
    target: String,
}

#[tauri::command]
pub fn count_backlinks(vault_root: String, target: String) -> CommandResult<usize> {
    let root = PathBuf::from(&vault_root);
    if vault_root.is_empty() || target.is_empty() || !root.is_dir() {
        return Ok(0);
    }

    let target_canon = match norm_abs(&target) {
        Some(c) => c,
        None => return Ok(0),
    };
    let target_base = with_md_ext(basename(&target)).to_lowercase();

    let mut files: Vec<PathBuf> = Vec::new();
    collect_md(&root, &mut files);

    let root_str = root.to_string_lossy().to_string();
    let mut count = 0usize;
    for file in &files {
        // Skip the target itself — a note doesn't back-link to itself.
        if norm_abs(&file.to_string_lossy()).as_deref() == Some(target_canon.as_str()) {
            continue;
        }
        let content = match fs::read_to_string(file) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let from_dir = file
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        for link in extract_links(&content) {
            if resolves_to(&link, &from_dir, &root_str, &target_canon, &target_base) {
                count += 1;
            }
        }
    }
    Ok(count)
}

/// Recursively collect `.md`/`.markdown` files, skipping dotfiles/dot-dirs.
fn collect_md(dir: &Path, out: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            collect_md(&path, out);
        } else if path
            .extension()
            .map(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
            .unwrap_or(false)
        {
            out.push(path);
        }
    }
}

/// Does `link` resolve to the target note?
fn resolves_to(
    link: &Link,
    from_dir: &str,
    root_str: &str,
    target_canon: &str,
    target_base: &str,
) -> bool {
    let cleaned = link.target.trim();
    if cleaned.is_empty() {
        return false;
    }

    if !link.wiki {
        // Markdown links always resolve relative to the linking file's dir.
        return norm_abs(&format!("{}/{}", from_dir, cleaned)).as_deref() == Some(target_canon);
    }

    // `./x` / `../x` — relative to the linking file's directory.
    if cleaned.starts_with("./") || cleaned.starts_with("../") {
        let joined = format!("{}/{}", from_dir, with_md_ext(cleaned));
        return norm_abs(&joined).as_deref() == Some(target_canon);
    }
    // Contains `/` — vault-root-relative path.
    if cleaned.contains('/') {
        let joined = format!("{}/{}", root_str, with_md_ext(cleaned));
        return norm_abs(&joined).as_deref() == Some(target_canon);
    }
    // Bare name — match the target's basename anywhere in the vault.
    with_md_ext(cleaned).to_lowercase() == target_base
}

/// Extract wikilink and Markdown-link targets from note text.
fn extract_links(content: &str) -> Vec<Link> {
    let mut out = Vec::new();
    let bytes = content.as_bytes();
    let n = bytes.len();
    let mut i = 0;
    while i < n {
        // `[[wikilink]]` or `![[embed]]` — the leading `!` is irrelevant here.
        if bytes[i] == b'[' && i + 1 < n && bytes[i + 1] == b'[' {
            if let Some(end) = content[i + 2..].find("]]") {
                let inner = &content[i + 2..i + 2 + end];
                // Strip `|alias`, `#heading`, and `^block` suffixes.
                let target = inner
                    .split(|c| c == '|' || c == '#' || c == '^')
                    .next()
                    .unwrap_or("")
                    .trim();
                if !target.is_empty() {
                    out.push(Link {
                        wiki: true,
                        target: target.to_string(),
                    });
                }
                i += 2 + end + 2;
                continue;
            }
        }
        // `](url)` — the URL portion of a Markdown link or image.
        if bytes[i] == b']' && i + 1 < n && bytes[i + 1] == b'(' {
            if let Some(end) = content[i + 2..].find(')') {
                let url = &content[i + 2..i + 2 + end];
                if let Some(target) = md_link_target(url) {
                    out.push(Link {
                        wiki: false,
                        target,
                    });
                }
                i += 2 + end + 1;
                continue;
            }
        }
        i += 1;
    }
    out
}

/// Normalise a Markdown link URL, keeping only local `.md`/`.markdown` targets.
/// Returns `None` for external URLs, anchors, and non-Markdown files.
fn md_link_target(url: &str) -> Option<String> {
    let url = url.trim();
    // Drop a `#fragment` / `?query`, and a surrounding `<...>`.
    let url = url.trim_start_matches('<').trim_end_matches('>');
    let path = url.split(['#', '?']).next().unwrap_or("").trim();
    if path.is_empty() || path.contains("://") || path.starts_with('#') {
        return None;
    }
    if matches!(
        path.split(':').next(),
        Some("mailto") | Some("tel") | Some("http") | Some("https")
    ) && path.contains(':')
    {
        return None;
    }
    let decoded = percent_decode(path);
    let lower = decoded.to_lowercase();
    if lower.ends_with(".md") || lower.ends_with(".markdown") {
        Some(decoded)
    } else {
        None
    }
}

/// Minimal percent-decoding for link paths (`%20` → space, etc.).
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                out.push((hi * 16 + lo) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Append `.md` unless the name already ends in `.md`/`.markdown`.
fn with_md_ext(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower.ends_with(".md") || lower.ends_with(".markdown") {
        name.to_string()
    } else {
        format!("{}.md", name)
    }
}

/// Last path segment of a `/`-separated path.
fn basename(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// Collapse `.`/`..` segments and lowercase, yielding an absolute path string.
/// Returns `None` if the path escapes above the filesystem root.
fn norm_abs(s: &str) -> Option<String> {
    let mut out: Vec<&str> = Vec::new();
    for seg in s.split('/') {
        match seg {
            "" | "." => continue,
            ".." => {
                if out.is_empty() {
                    return None;
                }
                out.pop();
            }
            _ => out.push(seg),
        }
    }
    Some(format!("/{}", out.join("/")).to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write(root: &Path, rel: &str, content: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, content).unwrap();
    }

    #[test]
    fn counts_wikilinks_md_links_and_skips_noise() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        // The target note that everything may link to.
        write(root, "notes/target.md", "# Target");

        // Bare wikilink by basename, with an alias — counts.
        write(root, "a.md", "see [[target|the goal]] here");
        // Wikilink with a heading suffix — counts.
        write(root, "b.md", "[[target#section]]");
        // Vault-root-relative wikilink path — counts.
        write(root, "deep/c.md", "[[notes/target]]");
        // Relative Markdown link from the same folder — counts.
        write(root, "notes/d.md", "[t](target.md)");
        // Relative `../` Markdown link — counts.
        write(root, "notes/sub/e.md", "[t](../target.md)");
        // Embed (`![[ ]]`) — counts as a backlink, like Obsidian.
        write(root, "f.md", "![[target]]");

        // Noise that must NOT count:
        write(root, "g.md", "[[someone-else]]");
        write(root, "h.md", "[external](https://target.md)");
        write(root, "i.md", "[img](target.png)");
        write(root, ".hidden/j.md", "[[target]]"); // dotted dir is skipped
        write(root, "notes/target.md.bak", "[[target]]"); // not markdown

        // The target linking to itself must not count.
        let target = root.join("notes/target.md");
        fs::write(&target, "[[target]] self ref").unwrap();

        let count = count_backlinks(
            root.to_string_lossy().to_string(),
            target.to_string_lossy().to_string(),
        )
        .unwrap();
        assert_eq!(count, 6);
    }

    #[test]
    fn returns_zero_for_missing_or_empty_inputs() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        assert_eq!(count_backlinks(String::new(), "x".into()).unwrap(), 0);
        assert_eq!(count_backlinks(root, String::new()).unwrap(), 0);
    }
}
