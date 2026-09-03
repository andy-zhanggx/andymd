//! Markdown → embedding chunks.
//!
//! A note is split at its headings; sections longer than `MAX_CHUNK_CHARS`
//! are split again at blank lines so every chunk fits comfortably inside the
//! model's 512-token window. Each chunk carries the nearest heading (embedded
//! together with the body, which gives short sections useful context) and the
//! line it starts on, so a hit can be revealed in the editor.

/// Upper bound on a chunk's body, in characters (CJK ≈ 1 token per char).
pub const MAX_CHUNK_CHARS: usize = 800;
/// Chunks shorter than this carry no signal and are dropped.
pub const MIN_CHUNK_CHARS: usize = 20;
/// Preview shown in the results list.
pub const SNIPPET_CHARS: usize = 160;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Chunk {
    /// Nearest heading above the chunk (may be empty).
    pub heading: String,
    /// 1-based line the chunk body starts on.
    pub line: usize,
    /// What gets embedded: `heading\nbody` (or just the body).
    pub text: String,
    /// Whitespace-collapsed head of the body for the results list.
    pub snippet: String,
}

/// Split `content` into embedding chunks.
pub fn chunk_markdown(content: &str) -> Vec<Chunk> {
    let lines: Vec<&str> = content.lines().collect();
    let mut out = Vec::new();
    let mut i = skip_frontmatter(&lines);

    let mut heading = String::new();
    let mut section: Vec<(usize, &str)> = Vec::new(); // (1-based line, text)
    let mut in_fence: Option<&str> = None;

    while i < lines.len() {
        let line = lines[i];
        let trimmed = line.trim_start();
        if let Some(fence) = in_fence {
            if trimmed.starts_with(fence) {
                in_fence = None;
            }
            section.push((i + 1, line));
        } else if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = Some(&trimmed[..3]);
            section.push((i + 1, line));
        } else if let Some(h) = heading_text(line) {
            flush(&heading, &section, &mut out);
            heading = h;
            section.clear();
        } else {
            section.push((i + 1, line));
        }
        i += 1;
    }
    flush(&heading, &section, &mut out);
    out
}

/// Index of the first line after a leading `---` YAML block (or 0).
fn skip_frontmatter(lines: &[&str]) -> usize {
    if lines.first().map(|l| l.trim_end()) != Some("---") {
        return 0;
    }
    lines
        .iter()
        .skip(1)
        .position(|l| l.trim_end() == "---")
        .map(|p| p + 2)
        .unwrap_or(0)
}

/// Heading text for an ATX heading line. Lenient about the space after the
/// hashes (`##标题` is a heading in this app), strict about the hash count.
fn heading_text(line: &str) -> Option<String> {
    let hashes = line.chars().take_while(|c| *c == '#').count();
    if hashes == 0 || hashes > 6 {
        return None;
    }
    let rest = line[hashes..].trim().trim_end_matches('#').trim();
    if rest.is_empty() {
        return None;
    }
    Some(rest.to_string())
}

/// Turn one heading section into chunks, splitting long sections at blank
/// lines (and, for a single oversized paragraph, at a hard character cap).
fn flush(heading: &str, section: &[(usize, &str)], out: &mut Vec<Chunk>) {
    // Paragraphs: runs of non-blank lines.
    let mut paragraphs: Vec<(usize, String)> = Vec::new();
    let mut cur: Option<(usize, Vec<&str>)> = None;
    for (line, text) in section {
        if text.trim().is_empty() {
            if let Some((l, ls)) = cur.take() {
                paragraphs.push((l, ls.join("\n")));
            }
        } else {
            cur.get_or_insert_with(|| (*line, Vec::new())).1.push(text);
        }
    }
    if let Some((l, ls)) = cur.take() {
        paragraphs.push((l, ls.join("\n")));
    }

    // Pack paragraphs into pieces of at most MAX_CHUNK_CHARS.
    let mut pieces: Vec<(usize, String)> = Vec::new();
    let mut acc: Option<(usize, String)> = None;
    for (line, para) in paragraphs {
        let para_len = para.chars().count();
        if para_len > MAX_CHUNK_CHARS {
            if let Some(a) = acc.take() {
                pieces.push(a);
            }
            let chars: Vec<char> = para.chars().collect();
            for window in chars.chunks(MAX_CHUNK_CHARS) {
                // Later windows report the paragraph's start line; exact enough.
                pieces.push((line, window.iter().collect()));
            }
            continue;
        }
        match acc.as_mut() {
            Some((_, text)) if text.chars().count() + 1 + para_len <= MAX_CHUNK_CHARS => {
                text.push('\n');
                text.push_str(&para);
            }
            Some(_) => {
                pieces.push(acc.take().unwrap());
                acc = Some((line, para));
            }
            None => acc = Some((line, para)),
        }
    }
    if let Some(a) = acc.take() {
        pieces.push(a);
    }

    if pieces.is_empty() && !heading.is_empty() {
        // Heading with no body: still worth indexing if it says something.
        pieces.push((section.first().map(|s| s.0).unwrap_or(1), String::new()));
    }

    for (line, body) in pieces {
        let text = if heading.is_empty() {
            body.clone()
        } else if body.is_empty() {
            heading.to_string()
        } else {
            format!("{heading}\n{body}")
        };
        if text.chars().count() < MIN_CHUNK_CHARS {
            continue;
        }
        let snippet = snippet_of(if body.is_empty() { heading } else { &body });
        out.push(Chunk {
            heading: heading.to_string(),
            line,
            text,
            snippet,
        });
    }
}

/// Collapse whitespace and cap at `SNIPPET_CHARS`.
fn snippet_of(body: &str) -> String {
    let collapsed: Vec<&str> = body.split_whitespace().collect();
    let joined = collapsed.join(" ");
    let mut s: String = joined.chars().take(SNIPPET_CHARS).collect();
    if joined.chars().count() > SNIPPET_CHARS {
        s.push('…');
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_at_headings_and_carries_the_heading_into_the_text() {
        let md = "# Recall regression\n\nRecall dropped 3% after the release.\n\n## Root cause\n\nThe feature pipeline lost a column that the ranker needs.\n";
        let chunks = chunk_markdown(md);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].heading, "Recall regression");
        assert_eq!(chunks[0].line, 3);
        assert_eq!(chunks[0].text, "Recall regression\nRecall dropped 3% after the release.");
        assert_eq!(chunks[0].snippet, "Recall dropped 3% after the release.");
        assert_eq!(chunks[1].heading, "Root cause");
        assert_eq!(chunks[1].line, 7);
    }

    #[test]
    fn skips_frontmatter_and_ignores_hashes_inside_code_fences() {
        let md = "---\ntitle: x\ntags: [a]\n---\nIntro paragraph long enough to keep around.\n\n```sh\n# not a heading\necho hi\n```\n";
        let chunks = chunk_markdown(md);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].heading, "");
        assert_eq!(chunks[0].line, 5);
        assert!(chunks[0].text.contains("# not a heading"));
    }

    #[test]
    fn lenient_chinese_headings_and_short_chunks_dropped() {
        let md = "##标题\n\n这是一段足够长的中文正文，用来测试分块逻辑是否正常工作。\n\n## tiny\n\nok\n";
        let chunks = chunk_markdown(md);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].heading, "标题");
        assert!(chunks[0].text.starts_with("标题\n这是一段"));
    }

    #[test]
    fn long_sections_split_at_blank_lines_and_oversized_paragraphs_hard_wrap() {
        let para = "word ".repeat(100).trim().to_string(); // ~500 chars
        let md = format!("# H\n\n{para}\n\n{para}\n\n{para}\n");
        let chunks = chunk_markdown(&md);
        assert_eq!(chunks.len(), 3);
        assert!(chunks.iter().all(|c| c.text.chars().count() <= MAX_CHUNK_CHARS + 2));
        assert_eq!(chunks[1].line, 5);

        let huge = "字".repeat(2000);
        let chunks = chunk_markdown(&huge);
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].text.chars().count(), MAX_CHUNK_CHARS);
    }

    #[test]
    fn heading_only_notes_and_snippets() {
        let chunks = chunk_markdown("# A meaningful title about search quality\n");
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].text, "A meaningful title about search quality");
        assert_eq!(chunks[0].snippet, "A meaningful title about search quality");

        let long = format!("{}\n", "x ".repeat(200));
        let chunks = chunk_markdown(&long);
        assert!(chunks[0].snippet.ends_with('…'));
        assert_eq!(chunks[0].snippet.chars().count(), SNIPPET_CHARS + 1);
        assert!(chunk_markdown("# \n\n\n").is_empty());
    }
}
