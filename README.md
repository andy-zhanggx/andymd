# Typora Clone (v0.1 MVP)

macOS WYSIWYG Markdown editor. Built with Tauri 2 + React 18 + Milkdown.

## Develop

- `pnpm install`
- `pnpm tauri dev`

## Build

- `pnpm tauri build` -> `src-tauri/target/release/bundle/`

## Test

- `pnpm test` — TypeScript/Vitest
- `cd src-tauri && cargo test` — Rust

## Docs

- Design: `docs/superpowers/specs/2026-04-23-typora-clone-design.md`
- Plan: `docs/superpowers/plans/2026-04-23-v0.1-mvp.md`
