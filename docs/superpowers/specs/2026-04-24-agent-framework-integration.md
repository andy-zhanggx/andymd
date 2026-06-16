# AndyMD — Multi-Agent Development Framework Integration

**Date:** 2026-04-24
**Status:** Approved (by Andy)
**Branch:** `iter/001-agent-framework`
**Worktree:** `.worktrees/iter-001-agent-framework`

## Symptom / Motivation

AndyMD has no project-level `CLAUDE.md`, no `.claude/` config, and `docs/` contains only empty `superpowers/{plans,specs}` directories. Each session re-invents the workflow: roles, branch naming, verify command, where plans/ADRs/lessons live. There is no agreed protocol for multi-agent collaboration (PM/Architect/Dev/Reviewer), no single `make verify` gate, and no iteration cadence.

## Root Cause

The project was scaffolded rapidly for v0.1 without porting over Andy's established multi-agent practices from `~/projects/kb_builder/`. kb_builder has a proven 5-role team model (PM / Architect / BE Dev / FE Dev / Reviewer), iteration lifecycle, docs hygiene (LESSONS / THOUGHTS / TODO / CHANGELOG / ADRs / iterations), and a `make verify` gate — none of which are in AndyMD.

## Fix

Port the multi-agent framework from kb_builder into AndyMD, adapted to AndyMD's stack (Tauri = Rust backend in `src-tauri/` + React/TS frontend in `src/`, pnpm, GitHub remote).

### Files to create

**Project root:**

- `CLAUDE.md` — project guide, modeled on `kb_builder/CLAUDE.md`. Sections:
  - Overview (AndyMD = Milkdown-based Tauri markdown editor)
  - Quick Commands (pnpm dev/build/test, tauri dev/build, cargo test, make verify)
  - Project Layout (src/, src-tauri/, docs/, scripts/)
  - Config & Keys (tauri.conf.json, vite.config.ts, vitest.config.ts)
  - Documentation index (links to docs/*)
  - Git Workflow (branch naming `iter/NNN-<feature>`, worktrees at `.worktrees/<name>`, GitHub + `gh pr create`)
  - Agent Team Flow (5 roles table, iteration lifecycle, concurrency model, how to run in Claude Code)
  - Cleanup Iterations (every 10th)
  - Principles (small iterations, review gates, document everything, CI as feedback, worktree isolation)
  - Superpowers mapping (project-specific table)
  - Codex CLI integration (MUST USE for code changes)

- `Makefile` — targets:
  - `verify` = `pnpm install --frozen-lockfile && pnpm build && pnpm test && cd src-tauri && cargo test && cargo clippy -- -D warnings`
  - `build` = pnpm build (no tauri bundle; keep fast)
  - `test` = pnpm test && (cd src-tauri && cargo test)
  - `clippy` = cd src-tauri && cargo clippy -- -D warnings
  - `dev` = pnpm tauri dev
  - `fmt` = pnpm prettier --write + cd src-tauri && cargo fmt
  - `.PHONY` declaration for all

**docs/ top-level files:**

- `docs/WORKFLOW.md` — AndyMD dev workflow, ported + adapted from kb_builder. Sections:
  1. Overview
  2. Multi-Agent Team (PM / Architect / BE Dev / FE Dev / Reviewer) — 5 roles, adapted scopes:
     - BE Dev: `src-tauri/` (Rust)
     - FE Dev: `src/` (React/TS), `index.html`, `vite.config.ts`
     - PM/Architect: `docs/` only
     - Reviewer: `docs/LESSONS.md` only
  3. CI/CD — TODO note for GitHub Actions, no yml committed yet
  4. Verification for Coding Agents — `make verify` contract
  5. Iteration Process (5 steps)
  6. Git Workflow (GitHub, `gh pr create`)
  7. Project Documentation layout
  8. Maintenance Rules

- `docs/TODO.md` — skeleton with "Phase 1: Foundation ✓" summarizing v0.1 commits, and empty "Phase 2: <next>" placeholder. Tag current as Phase 1 complete.

- `docs/THOUGHTS.md` — skeleton with heading + one bootstrap bullet ("Capture offhand ideas here — PM reviews before each iteration.")

- `docs/LESSONS.md` — skeleton heading only, note "Reviewer appends findings here after each iteration."

- `docs/CHANGELOG.md` — **backfill v0.1 from commits** (2026-04-23 → 2026-04-24):
  - Group into: Scaffolding / Rust backend / Frontend services / UI / Editor / Polish
  - Reference specific commit hashes where useful
  - End with "## [Unreleased]" section

**docs/ directory skeletons:**

- `docs/iterations/iter-001-agent-framework.md` — this iteration itself, documenting the framework setup
- `docs/iterations/README.md` — explains naming `iter-NNN-<slug>.md`, links to template
- `docs/iterations/TEMPLATE.md` — blank iteration template (Goal / Stories / Acceptance / Technical Design / Status)
- `docs/architecture/README.md` — explains ADR naming `adr-NNN-<topic>.md`, MADR-lite format, links to template
- `docs/architecture/TEMPLATE.md` — blank ADR template (Context / Decision / Rationale / Consequences / Status)
- `docs/features/README.md` — explains feature spec format, optional
- `docs/features/.gitkeep`

**Leave unchanged:**
- `docs/superpowers/{plans,specs}/` structure (keep; plans/ currently empty, specs/ now has this file)
- `src/`, `src-tauri/` source
- `package.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`
- `README.md` (keep existing; CLAUDE.md is separate)

**Not doing this iteration (deferred):**
- `.github/workflows/*.yml` — will be added in a later iter once `make verify` is stable
- `.claude/settings.json` with hooks — no hooks needed yet
- Automation scripts to scaffold new iterations
- Any source code changes

## Decisions Andy Made

1. **Branch name:** `iter/001-agent-framework` (worktree at `.worktrees/iter-001-agent-framework`)
2. **Roles:** Keep all 5 (PM / Architect / BE Dev / FE Dev / Reviewer). Tauri's BE/FE split maps naturally to `src-tauri/` and `src/`.
3. **Backfill CHANGELOG** from v0.1 commits — group semantically, reference commit hashes.
4. **Also migrate docs/ practice from kb** — mirror kb_builder's docs layout (iterations/, architecture/, features/, LESSONS/THOUGHTS/TODO/CHANGELOG/WORKFLOW), not just WORKFLOW.md.

## Verification

1. `make verify` passes on the worktree branch:
   - `pnpm install --frozen-lockfile` — success
   - `pnpm build` — tsc + vite build pass
   - `pnpm test` — existing Vitest suite passes
   - `cd src-tauri && cargo test` — existing cargo tests pass
   - `cargo clippy -- -D warnings` — no new warnings

2. File checklist — all files listed in "Files to create" exist with non-trivial content

3. Every file referenced in `CLAUDE.md`'s Documentation section exists at the referenced path

4. `docs/CHANGELOG.md` lists all 30 commits from `git log main` grouped into v0.1, with no placeholder TODOs

5. `git status` on the worktree: only the new files staged/untracked, no modifications to `src/` / `src-tauri/` / config files

6. Spec file (this file) referenced from `docs/iterations/iter-001-agent-framework.md`

## Out of Scope for this Spec

- Running an actual iteration (iter-002+) using the new framework — this iter just installs the framework
- Adding GitHub Actions CI
- Adding `.claude/settings.json` hooks
- Any functionality changes to the editor
- Ultrareview, design review, or other gstack workflows

## Implementation

Per Andy's global rules, all file creation is delegated to Codex via `codex:rescue`. Claude orchestrates:
1. Hand this spec to Codex with file-by-file instructions
2. Review the diff Codex produces
3. Run `make verify` to confirm the gate still passes
4. Report back to Andy for final human review before merge
