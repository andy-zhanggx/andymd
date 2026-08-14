//! Vault-wide full-text search.
//!
//! Scans every Markdown/text file under the workspace root for a
//! case-insensitive substring and returns per-file line matches. Like the
//! backlink scan, this runs on Tauri's command thread pool so a large vault
//! never blocks the webview. Result sizes are capped so a pathological query
//! (single letter in a huge vault) can't flood the IPC channel — the frontend
//! shows a "truncated" hint instead.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::CommandResult;

/// Per-file cap keeps one giant log file from crowding out other results.
const MAX_MATCHES_PER_FILE: usize = 50;
/// Global cap bounds the IPC payload.
const MAX_TOTAL_MATCHES: usize = 1000;
/// Long lines are trimmed to a window around the first match.
const MAX_LINE_CHARS: usize = 240;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    /// 1-based line number in the file.
    pub line: usize,
    /// The (possibly trimmed) line text containing the match.
    pub text: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileMatches {
    pub path: String,
    pub rel_path: String,
    pub matches: Vec<SearchMatch>,
    /// True when this file had more matches than the per-file cap.
    pub truncated: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    pub files: Vec<FileMatches>,
    /// True when the global cap cut the scan short.
    pub truncated: bool,
}

#[tauri::command]
pub fn search_workspace(root: String, query: String) -> CommandResult<SearchResults> {
    let root_path = PathBuf::from(&root);
    let needle = query.trim().to_lowercase();
    let mut results = SearchResults {
        files: Vec::new(),
        truncated: false,
    };
    if needle.is_empty() || !root_path.is_dir() {
        return Ok(results);
    }

    let mut files: Vec<PathBuf> = Vec::new();
    collect_searchable(&root_path, &mut files);
    files.sort();

    let mut total = 0usize;
    for file in files {
        if total >= MAX_TOTAL_MATCHES {
            results.truncated = true;
            break;
        }
        let content = match fs::read_to_string(&file) {
            Ok(c) => c,
            Err(_) => continue, // unreadable or non-UTF-8 — skip
        };
        let mut matches: Vec<SearchMatch> = Vec::new();
        let mut file_truncated = false;
        for (idx, line) in content.lines().enumerate() {
            if !line.to_lowercase().contains(&needle) {
                continue;
            }
            if matches.len() >= MAX_MATCHES_PER_FILE || total >= MAX_TOTAL_MATCHES {
                file_truncated = matches.len() >= MAX_MATCHES_PER_FILE;
                results.truncated = results.truncated || total >= MAX_TOTAL_MATCHES;
                break;
            }
            matches.push(SearchMatch {
                line: idx + 1,
                text: trim_line(line, &needle),
            });
            total += 1;
        }
        if !matches.is_empty() {
            let rel = file
                .strip_prefix(&root_path)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| file.to_string_lossy().to_string());
            results.files.push(FileMatches {
                path: file.to_string_lossy().to_string(),
                rel_path: rel,
                matches,
                truncated: file_truncated,
            });
        }
    }
    Ok(results)
}

/// Recursively collect `.md`/`.markdown`/`.txt` files, skipping dotted
/// entries (`.git`, `.obsidian`, …) — same traversal rules as the backlink
/// scan.
fn collect_searchable(dir: &Path, out: &mut Vec<PathBuf>) {
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
            collect_searchable(&path, out);
        } else if path
            .extension()
            .map(|e| {
                e.eq_ignore_ascii_case("md")
                    || e.eq_ignore_ascii_case("markdown")
                    || e.eq_ignore_ascii_case("txt")
            })
            .unwrap_or(false)
        {
            out.push(path);
        }
    }
}

/// Trim a long line to a char-boundary-safe window around its first match so
/// the result list stays readable (and the payload small).
fn trim_line(line: &str, lower_needle: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    if chars.len() <= MAX_LINE_CHARS {
        return line.to_string();
    }
    // Find the first match position in char space.
    let lower: Vec<char> = line.to_lowercase().chars().collect();
    let needle: Vec<char> = lower_needle.chars().collect();
    let hit = lower
        .windows(needle.len().max(1))
        .position(|w| w == needle.as_slice())
        .unwrap_or(0);
    let start = hit.saturating_sub(MAX_LINE_CHARS / 4);
    let end = (start + MAX_LINE_CHARS).min(chars.len());
    let mut out = String::new();
    if start > 0 {
        out.push('…');
    }
    out.extend(&chars[start..end]);
    if end < chars.len() {
        out.push('…');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &Path, rel: &str, content: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, content).unwrap();
    }

    #[test]
    fn finds_case_insensitive_matches_across_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "a.md", "Hello World\nnothing here\nhello again");
        write(root, "sub/b.markdown", "say HELLO");
        write(root, "notes.txt", "hello txt");
        write(root, "c.png", "hello binary-ish"); // wrong extension — skipped
        write(root, ".hidden/d.md", "hello hidden"); // dotted dir — skipped

        let res = search_workspace(root.to_string_lossy().into(), "hello".into()).unwrap();
        assert_eq!(res.files.len(), 3);
        assert!(!res.truncated);

        let a = res.files.iter().find(|f| f.rel_path == "a.md").unwrap();
        assert_eq!(a.matches.len(), 2);
        assert_eq!(a.matches[0].line, 1);
        assert_eq!(a.matches[0].text, "Hello World");
        assert_eq!(a.matches[1].line, 3);

        assert!(res.files.iter().any(|f| f.rel_path == "sub/b.markdown"));
        assert!(res.files.iter().any(|f| f.rel_path == "notes.txt"));
    }

    #[test]
    fn empty_query_or_missing_root_returns_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        assert!(search_workspace(root.clone(), "  ".into()).unwrap().files.is_empty());
        assert!(search_workspace("/no/such/dir".into(), "x".into())
            .unwrap()
            .files
            .is_empty());
    }

    #[test]
    fn caps_matches_per_file() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let body = "match me\n".repeat(MAX_MATCHES_PER_FILE + 10);
        write(root, "big.md", &body);

        let res = search_workspace(root.to_string_lossy().into(), "match".into()).unwrap();
        assert_eq!(res.files.len(), 1);
        assert_eq!(res.files[0].matches.len(), MAX_MATCHES_PER_FILE);
        assert!(res.files[0].truncated);
    }

    #[test]
    fn trims_long_lines_around_the_match() {
        let long = format!("{}needle{}", "x".repeat(500), "y".repeat(500));
        let out = trim_line(&long, "needle");
        assert!(out.chars().count() <= MAX_LINE_CHARS + 2); // + ellipses
        assert!(out.contains("needle"));
        assert!(out.starts_with('…') && out.ends_with('…'));
    }

    #[test]
    fn cjk_lines_survive_trimming() {
        let long = format!("{}目标{}", "汉".repeat(300), "字".repeat(300));
        let out = trim_line(&long, "目标");
        assert!(out.contains("目标"));
    }
}
