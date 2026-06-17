#!/usr/bin/env node
// Publish the signed updater artifacts to the PUBLIC GitHub releases repo so the
// in-app updater can fetch them anonymously (no token in the shipped app).
//
//   pnpm version:set <x.y.z>
//   TAURI_SIGNING_PRIVATE_KEY="$(cat andymd-updater.key)" \
//   TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
//     pnpm tauri build --target universal-apple-darwin   # → *.app.tar.gz + .sig
//   pnpm release:update                                  # this script
//
// Requires the GitHub CLI authenticated to an account with push access to the
// releases repo: `gh auth status` must be green. The repo is configured via
// $GH_RELEASES_REPO (default OldBao/andymd-releases) and MUST be public.
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const tag = `v${version}`;
const repo = process.env.GH_RELEASES_REPO || 'OldBao/andymd-releases';

// Locate the signed updater tarball — prefer the universal build, fall back to
// the host-arch build.
const candidates = [
  'src-tauri/target/universal-apple-darwin/release/bundle/macos',
  'src-tauri/target/release/bundle/macos',
];
let macDir, tar;
for (const c of candidates) {
  try {
    const f = readdirSync(join(root, c)).find((x) => /\.app\.tar\.gz$/.test(x));
    if (f) { macDir = join(root, c); tar = f; break; }
  } catch { /* dir absent — try next */ }
}
if (!tar) die(`no *.app.tar.gz under ${candidates.join(' or ')} — run a signed \`pnpm tauri build\` first`);
const signature = readFileSync(join(macDir, `${tar}.sig`), 'utf8').trim();

// The asset URL is deterministic from the tag + filename, so we can bake it into
// latest.json before uploading.
const downloadUrl = `https://github.com/${repo}/releases/download/${tag}/${tar}`;
const platform = { signature, url: downloadUrl };
const manifest = {
  version,
  notes: extractNotes(version),
  pub_date: process.env.PUB_DATE || new Date().toISOString(),
  // A universal binary serves both architectures from the same artifact.
  platforms: { 'darwin-aarch64': platform, 'darwin-x86_64': platform },
};
const manifestPath = join(mkdtempSync(join(tmpdir(), 'andymd-')), 'latest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const gh = (...args) => execFileSync('gh', args, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

// Create the release if absent, then (re)upload the tarball + manifest.
let exists = true;
try { gh('release', 'view', tag, '--repo', repo); } catch { exists = false; }
if (!exists) {
  console.log(`↑ creating release ${tag} on ${repo}`);
  gh('release', 'create', tag, '--repo', repo, '--title', tag, '--notes', manifest.notes || tag);
}
console.log(`↑ uploading ${tar} + latest.json → ${repo}@${tag}`);
gh('release', 'upload', tag, join(macDir, tar), `${join(macDir, tar)}.sig`, manifestPath, '--repo', repo, '--clobber');

console.log(`✓ published updater artifacts for ${tag}`);
console.log(`  endpoint: https://github.com/${repo}/releases/latest/download/latest.json`);

/** Pull this version's bullet lines out of CHANGELOG.md for the `notes` field. */
function extractNotes(ver) {
  let md;
  try { md = readFileSync(join(root, 'CHANGELOG.md'), 'utf8'); } catch { return ''; }
  const lines = md.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^##\\s+\\[${ver.replace(/\./g, '\\.')}\\]`).test(l));
  if (start < 0) return '';
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+\[/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}
